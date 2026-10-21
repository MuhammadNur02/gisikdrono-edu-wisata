-- Guest links without accounts (docs/Security.md §6.7: GUEST-01, GUEST-02, BOOK-15; Task P3.3.02, P3.3.03). The
-- links themselves are HMAC tokens minted and checked in src/lib/links; the database keeps what makes them live
-- (bookings.token_version) and decides who a link is sent to.

-- /reservasi/cari: a visitor who gives a booking code and the booking's phone number or email address gets a link
-- sent again to the contact on file, never shown. Matching happens here, so the booking's contact never leaves the
-- database, and the answer the visitor sees is the same whatever this returns: queued, capped (three per booking and
-- channel a day, so nobody can flood a group's WhatsApp through the form) or no_match. The link goes to the verified
-- WhatsApp number as a manage link while WhatsApp is on; otherwise to the email address, as a manage link once the
-- address is confirmed and a view link until then.
create function internal.resend_booking_link(
  p_booking_code text, p_phone text default null, p_email text default null
) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  daily_cap constant integer := 3;
  -- A visitor pressing the button again within this many seconds gets the message already queued.
  repeat_window constant integer := 900;
  booking record;
  send_channel public.notification_channel;
  send_to text;
  previous_settings jsonb;
begin
  select b.id, b.pic_phone, lower(b.pic_email::text) as pic_email, b.pic_first_name, b.phone_verified_at,
         b.email_verified_at
  into booking from public.bookings b where b.booking_code = p_booking_code;
  if not found or not ((p_phone is not null and booking.pic_phone = p_phone)
                       or (p_email is not null and booking.pic_email = lower(trim(p_email)))) then
    return 'no_match';
  end if;

  send_channel := case when booking.phone_verified_at is not null and internal.setting_is_on('whatsapp_enabled')
                       then 'whatsapp' else 'email' end;
  send_to := case send_channel when 'whatsapp' then booking.pic_phone else booking.pic_email end;
  if send_to is null then
    return 'no_match';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking_link:' || booking.id, 0));
  if (select count(*) from public.notifications n
      where n.booking_id = booking.id and n.template = 'booking_link' and n.channel = send_channel
        and n.created_at > now() - interval '1 day') >= daily_cap then
    return 'capped';
  end if;

  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  values (booking.id, send_channel, 'booking_link', send_to, booking.pic_first_name,
          jsonb_build_object('link_scope',
            case when send_channel = 'whatsapp' or booking.email_verified_at is not null then 'manage' else 'view' end),
          format('booking:%s:booking_link:%s:%s', booking.id, send_channel,
                 floor(extract(epoch from now()) / repeat_window)::bigint))
  on conflict (dedupe_key) do nothing;

  previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
  perform internal.log_audit('booking.access_link_resent', 'bookings', booking.id::text,
                             jsonb_build_object('channel', send_channel));
  perform internal.restore_settings(previous_settings);
  return 'queued';
end;
$$;

-- "Cabut tautan" on the manage page: every link minted for the booking so far stops working, because each carries
-- the token_version it was minted with. Returns the new version.
create function internal.revoke_guest_links(p_booking_id uuid) returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  new_version integer;
begin
  previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
  update public.bookings b set token_version = b.token_version + 1 where b.id = p_booking_id
  returning b.token_version into new_version;
  if new_version is null then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  perform internal.log_audit('booking.links_revoked', 'bookings', p_booking_id::text,
                             jsonb_build_object('token_version', new_version));
  perform internal.restore_settings(previous_settings);
  return new_version;
end;
$$;

revoke execute on function internal.resend_booking_link(text, text, text), internal.revoke_guest_links(uuid)
  from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16).
create function public.svc_resend_booking_link(
  p_booking_code text, p_phone text default null, p_email text default null
) returns text
  language sql security definer
  set search_path = ''
as $$ select internal.resend_booking_link(p_booking_code, p_phone, p_email); $$;

create function public.svc_revoke_guest_links(p_booking_id uuid) returns integer
  language sql security definer
  set search_path = ''
as $$ select internal.revoke_guest_links(p_booking_id); $$;

revoke execute on function public.svc_resend_booking_link(text, text, text), public.svc_revoke_guest_links(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_resend_booking_link(text, text, text), public.svc_revoke_guest_links(uuid)
  to service_role;
