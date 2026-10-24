-- Task P3.11.02 to P3.11.04 (docs/Security.md EP-02, EP-03, GUEST-07, OPS-06): the outbox's own rules for the first
-- P3.11 release. The switches whatsapp_enabled and email_enabled in site_settings decide whether a channel sends at
-- all: a message for a channel that is off is not queued, and one queued before the switch went off is cancelled when
-- the worker next claims, so its provider is never called; WhatsApp stays silent until the kelurahan's own number is
-- ready (decision of 2026-10-23). Before its booking is paid, an address gets few of the site's emails. And a provider
-- that refuses the server's own credentials is a fault for a person to fix at once, not a message to give up on
-- quietly (independent review of PR #50, M3).


-- Replaces the 0004 version. A channel switched off queues nothing. Before its booking is paid, an address gets at
-- most three of the site's pre-payment emails a day, so an address typed into the wizard by someone else is not
-- flooded (GUEST-07); a message held back this way leaves a rate_limited event. It checks no caller: the staff RPCs
-- of P4 that queue a message (check_in_ticket, issue_certificates, cancel_booking, record_refund) run as
-- authenticated, and no API role holds execute on it (rls_enumeration.sql). Everything else is unchanged.
create or replace function internal.enqueue_notification(
  p_booking_id uuid, p_template public.notification_template, p_channel public.notification_channel, p_params jsonb
) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  emails_before_payment constant integer := 3;
  pre_payment_templates constant public.notification_template[] :=
    array['booking_created', 'quotation_ready', 'payment_reminder', 'booking_expired', 'booking_link'];
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
  if p_channel = 'email' and p_template = any (pre_payment_templates) and booking.paid_at is null
     and not exists (select 1 from public.notifications n where n.dedupe_key = dedupe)
     and (select count(*) from public.notifications n
          where n.channel = 'email' and n.recipient = booking.pic_email and n.template = any (pre_payment_templates)
            and n.created_at > now() - interval '1 day') >= emails_before_payment then
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('rate_limited', 'info', 'bookings', p_booking_id::text,
            jsonb_build_object('limit', 'email_before_payment', 'template', p_template));
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

-- Replaces the 20261021100200 version. Before it claims, the worker cancels the waiting messages of a channel that is
-- off, erasing an OTP's code as an expired one is, so nothing reaches that channel's provider. A message left sending
-- by a worker that died has used its attempt: it is given back only while it has attempts left, and dead-lettered
-- once it has none, with the notification_dead event and alert of any other dead message, so a message that kills
-- its worker every time cannot loop for ever. Everything else is unchanged.
create or replace function internal.claim_notifications(p_limit integer, p_templates public.notification_template[])
  returns setof public.notifications
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('claim_notifications');
  if p_limit is null or p_limit < 1 or p_limit > 100 or coalesce(cardinality(p_templates), 0) = 0 then
    raise exception 'a claim takes 1 to 100 messages of at least one template' using errcode = '22023';
  end if;

  update public.notifications n set status = 'queued', locked_at = null
  where n.status = 'sending' and n.locked_at < now() - interval '10 minutes' and n.attempts < n.max_attempts;
  with stuck as (
    update public.notifications n
    set status = 'failed', dead_at = now(), locked_at = null, last_error_code = 'stuck_sending',
        last_error = 'Left sending by a worker that stopped, with no attempt left',
        params = case when n.template = 'phone_otp' then '{}'::jsonb else n.params end
    where n.status = 'sending' and n.locked_at < now() - interval '10 minutes' and n.attempts >= n.max_attempts
    returning n.id, n.template, n.channel, n.attempts),
  events as (
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    select 'notification_dead', 'medium', 'notifications', stuck.id::text,
           jsonb_build_object('template', stuck.template, 'channel', stuck.channel, 'error_code', 'stuck_sending',
                              'attempts', stuck.attempts)
    from stuck)
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select distinct on (stuck.template, stuck.channel) 'notification_dead', 'medium',
         format('notification_dead:%s:%s', stuck.template, stuck.channel),
         'Pesan outbox gagal terkirim dan berhenti dicoba',
         jsonb_build_object('template', stuck.template, 'channel', stuck.channel, 'error_code', 'stuck_sending')
  from stuck
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
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

-- Replaces the 20261021100200 version. A provider that refuses the server's credentials (Meta's 190, an HTTP 401)
-- refuses every message alike: the first such failure raises a high alert of its own, which the process-notifications
-- job emails out of band at once, and a message dead-lettered for it raises a high alert rather than a medium one.
-- Everything else is unchanged.
create or replace function internal.fail_notification(p_id uuid, p_error_code text, p_error text, p_permanent boolean)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  backoff_minutes constant integer[] := array[1, 5, 15, 60, 240];
  credential_errors constant text[] := array['meta_190', 'http_401'];
  message public.notifications;
  is_credential_error boolean := p_error_code = any (credential_errors);
begin
  select * into message from public.notifications n where n.id = p_id and n.status = 'sending' for update;
  if not found then
    return;
  end if;
  if is_credential_error then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('notification_credentials', 'high', format('notification_credentials:%s', message.channel),
            'Penyedia pesan menolak kredensial server; periksa token atau kunci API',
            jsonb_build_object('channel', message.channel, 'error_code', left(p_error_code, 60)))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
  end if;

  if coalesce(p_permanent, false) or message.attempts >= message.max_attempts then
    update public.notifications n set status = 'failed', dead_at = now(), locked_at = null,
      last_error_code = left(p_error_code, 60), last_error = left(p_error, 200),
      params = case when n.template = 'phone_otp' then '{}'::jsonb else n.params end
    where n.id = message.id;
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('notification_dead', case when is_credential_error then 'high' else 'medium' end::public.alert_severity,
            'notifications', message.id::text,
            jsonb_build_object('template', message.template, 'channel', message.channel,
                               'error_code', left(p_error_code, 60), 'attempts', message.attempts));
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('notification_dead', case when is_credential_error then 'high' else 'medium' end::public.alert_severity,
            format('notification_dead:%s:%s', message.template, message.channel),
            'Pesan outbox gagal terkirim dan berhenti dicoba',
            jsonb_build_object('template', message.template, 'channel', message.channel,
                               'error_code', left(p_error_code, 60)))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1,
        severity = greatest(public.security_alerts.severity, excluded.severity), notified_at = null;
    return;
  end if;

  update public.notifications n set status = 'failed', locked_at = null,
    last_error_code = left(p_error_code, 60), last_error = left(p_error, 200),
    next_attempt_at = now() + make_interval(mins => backoff_minutes[least(message.attempts, cardinality(backoff_minutes))])
  where n.id = message.id;
end;
$$;
