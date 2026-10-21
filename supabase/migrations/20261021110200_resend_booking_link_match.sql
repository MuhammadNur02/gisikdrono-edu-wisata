-- Review of PR #20 (info): the contact match of internal.resend_booking_link read
--   not ((p_phone is not null and pic_phone = p_phone) or (p_email is not null and pic_email = p_email))
-- in SQL's three-valued logic. For a booking whose number was gone, pic_phone = p_phone is null rather than false,
-- the whole condition was null, and IF treated it as "matches": any number typed for such a booking with an address
-- still on file queued a link to that address. The match is now a plain "is true", and a purged booking
-- (pii_purged_at set) is never matched at all, so the later "no contact to send to" branch can no longer happen
-- (bookings_contact_until_purged keeps both contacts while a booking is not purged). 20261021100300 stays as
-- applied; this replaces only the function's body.
create or replace function internal.resend_booking_link(
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
  previous_settings jsonb;
begin
  select b.id, b.pic_phone, lower(b.pic_email::text) as pic_email, b.pic_first_name, b.phone_verified_at,
         b.email_verified_at
  into booking from public.bookings b where b.booking_code = p_booking_code and b.pii_purged_at is null;
  if not found or (booking.pic_phone = p_phone or booking.pic_email = lower(trim(p_email))) is not true then
    return 'no_match';
  end if;

  send_channel := case when booking.phone_verified_at is not null and internal.setting_is_on('whatsapp_enabled')
                       then 'whatsapp' else 'email' end;
  perform pg_advisory_xact_lock(hashtextextended('booking_link:' || booking.id, 0));
  if (select count(*) from public.notifications n
      where n.booking_id = booking.id and n.template = 'booking_link' and n.channel = send_channel
        and n.created_at > now() - interval '1 day') >= daily_cap then
    return 'capped';
  end if;

  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  values (booking.id, send_channel, 'booking_link',
          case send_channel when 'whatsapp' then booking.pic_phone else booking.pic_email end, booking.pic_first_name,
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
revoke execute on function internal.resend_booking_link(text, text, text) from public, anon, authenticated;
