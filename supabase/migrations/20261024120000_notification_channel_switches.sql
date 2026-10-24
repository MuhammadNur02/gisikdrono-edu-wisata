-- Task P3.11.02 to P3.11.04 (docs/Security.md EP-02, EP-03, GUEST-07): the switches whatsapp_enabled and
-- email_enabled in site_settings decide whether a channel sends at all, and an address gets few emails before its
-- booking is paid. A message for a channel that is off is not queued, and one queued before the switch went off is
-- cancelled when the worker next claims, so its provider is never called: WhatsApp stays silent until the kelurahan's
-- own number is ready (decision of 2026-10-23), whatever was queued before.


-- Replaces the 0004 version. A channel switched off queues nothing. Before its booking is paid, an address gets at
-- most three of the site's emails a day, the OTP aside, so an address typed into the wizard by someone else is not
-- flooded (GUEST-07); a paid booking's messages are never held back. Everything else is unchanged.
create or replace function internal.enqueue_notification(
  p_booking_id uuid, p_template public.notification_template, p_channel public.notification_channel, p_params jsonb
) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  emails_before_payment constant integer := 3;
  booking record;
  recipient text;
  dedupe text := format('booking:%s:%s:%s', p_booking_id, p_template, p_channel);
  notification_id uuid;
begin
  select b.pic_phone, b.pic_email, b.pic_first_name, b.phone_verified_at, b.paid_at into booking
  from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if not internal.setting_is_on(case p_channel when 'whatsapp' then 'whatsapp_enabled' else 'email_enabled' end) then
    return null;
  end if;

  if p_channel = 'whatsapp' and p_template <> 'phone_otp' and booking.phone_verified_at is null then
    return null;
  end if;
  recipient := case p_channel when 'whatsapp' then booking.pic_phone else booking.pic_email end;
  if recipient is null then
    return null;
  end if;
  if p_channel = 'email' and p_template <> 'phone_otp' and booking.paid_at is null
     and (select count(*) from public.notifications n
          where n.channel = 'email' and n.recipient = booking.pic_email and n.template <> 'phone_otp'
            and n.created_at > now() - interval '1 day') >= emails_before_payment
     and not exists (select 1 from public.notifications n where n.dedupe_key = dedupe) then
    return null;
  end if;

  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  values (p_booking_id, p_channel, p_template, recipient, booking.pic_first_name, coalesce(p_params, '{}'), dedupe)
  on conflict (dedupe_key) do nothing
  returning id into notification_id;
  if notification_id is null then
    select n.id into notification_id from public.notifications n where n.dedupe_key = dedupe;
  end if;
  return notification_id;
end;
$$;

-- Replaces the 20261021100200 version: before it claims, the worker cancels the waiting messages of a channel that is
-- off, erasing an OTP's code as an expired one is, so nothing reaches that channel's provider. Everything else is
-- unchanged.
create or replace function internal.claim_notifications(p_limit integer, p_templates public.notification_template[])
  returns setof public.notifications
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or coalesce(cardinality(p_templates), 0) = 0 then
    raise exception 'a claim takes 1 to 100 messages of at least one template' using errcode = '22023';
  end if;

  update public.notifications n set status = 'queued', locked_at = null
  where n.status = 'sending' and n.locked_at < now() - interval '10 minutes';
  update public.notifications n set status = 'cancelled', params = '{}', locked_at = null,
    last_error_code = 'otp_expired'
  where n.template = 'phone_otp' and n.status in ('queued', 'failed') and n.dead_at is null
    and n.created_at < now() - interval '5 minutes';
  update public.notifications n
  set status = 'cancelled', locked_at = null, last_error_code = 'channel_disabled',
      params = case when n.template = 'phone_otp' then '{}'::jsonb else n.params end
  where n.status in ('queued', 'failed') and n.dead_at is null
    and not internal.setting_is_on(case n.channel when 'whatsapp' then 'whatsapp_enabled' else 'email_enabled' end);

  return query
  update public.notifications n set status = 'sending', locked_at = now(), attempts = n.attempts + 1
  where n.id in (
    select due.id from public.notifications due
    where due.status in ('queued', 'failed') and due.dead_at is null and due.next_attempt_at <= now()
      and due.template = any(p_templates)
    order by due.next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning n.*;
end;
$$;
