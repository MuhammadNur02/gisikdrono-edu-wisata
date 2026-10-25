-- Task P3.11.06 and P3.11.09 (docs/Security.md §10.1, §10.2; EP-01, EP-03, APP-12): what Meta and Resend report
-- about a message after it was sent. POST /api/webhooks/whatsapp and POST /api/webhooks/resend verify the sender's
-- signature on the raw body, then hand each report to svc_record_provider_status. A report moves a message forward
-- only (sent, then delivered, then read), a failure after sending (Meta's failed, Resend's bounced or complained)
-- dead-letters it as fail_notification does for a permanent error, and a report for a message that is unknown,
-- already dead or already further along changes nothing, so a replayed report is a no-op. Nothing here touches a
-- booking, a payment or a ticket.


-- The report, by the provider's message id on the channel that sent it. p_status is Meta's sent, delivered, read or
-- failed, or Resend's bounced or complained; p_error_code the server's own code ('meta_131026', 'resend_bounced').
-- Answers updated, unchanged or unknown.
create function internal.record_provider_status(
  p_channel public.notification_channel, p_provider_message_id text, p_status text,
  p_error_code text default null, p_occurred_at timestamptz default null
) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  forward constant text[] := array['sent', 'delivered', 'read'];
  failures constant text[] := array['failed', 'bounced', 'complained'];
  message public.notifications;
  reported_at timestamptz := least(coalesce(p_occurred_at, now()), now());
begin
  if p_status is null or not (p_status = any (forward) or p_status = any (failures)) then
    raise exception 'unknown provider status %', p_status using errcode = '22023';
  end if;
  select * into message from public.notifications n
  where n.channel = p_channel and n.provider_message_id = p_provider_message_id
  for update;
  if not found then
    return 'unknown';
  end if;
  if message.dead_at is not null or message.status::text <> all (forward) then
    return 'unchanged';
  end if;

  if p_status = any (failures) then
    perform internal.dead_letter_after_send(message, coalesce(p_error_code, p_channel || '_' || p_status), p_status);
    return 'updated';
  end if;
  if array_position(forward, p_status) <= array_position(forward, message.status::text) then
    return 'unchanged';
  end if;
  update public.notifications n
  set status = p_status::public.notification_status, provider_status = p_status,
      delivered_at = coalesce(n.delivered_at, reported_at),
      read_at = case when p_status = 'read' then coalesce(n.read_at, reported_at) else n.read_at end
  where n.id = message.id;
  return 'updated';
end;
$$;

-- A message the provider gave up on after it took it: failed and dead, with the notification_dead event and alert
-- of fail_notification (20261021100200). A visitor's address or number causes this, never the server, so the alert
-- stays medium and /api/health does not count it (SERVER_FAULT_ERRORS).
create function internal.dead_letter_after_send(
  p_message public.notifications, p_error_code text, p_provider_status text
) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  update public.notifications n
  set status = 'failed', dead_at = now(), provider_status = p_provider_status,
      last_error_code = left(p_error_code, 60), last_error = 'Rejected by the provider after it was sent'
  where n.id = p_message.id;
  insert into public.security_events (event_type, severity, entity_type, entity_id, details)
  values ('notification_dead', 'medium', 'notifications', p_message.id::text,
          jsonb_build_object('template', p_message.template, 'channel', p_message.channel,
                             'error_code', left(p_error_code, 60), 'after_send', true));
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('notification_dead', 'medium', format('notification_dead:%s:%s', p_message.template, p_message.channel),
          'Pesan outbox gagal terkirim dan berhenti dicoba',
          jsonb_build_object('template', p_message.template, 'channel', p_message.channel,
                             'error_code', left(p_error_code, 60)))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
end;
$$;

-- A webhook whose signature did not verify: a medium webhook_signature_invalid event naming the provider and the
-- sender's IP bucket, never the body. The route records at most webhook_rejection:ip of them an hour per IP.
create function internal.record_webhook_signature_failure(p_provider text, p_ip_bucket text) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if p_provider is null or p_provider not in ('whatsapp', 'resend') then
    raise exception 'unknown webhook provider %', p_provider using errcode = '22023';
  end if;
  insert into public.security_events (event_type, severity, entity_type, details)
  values ('webhook_signature_invalid', 'medium', 'webhook',
          jsonb_build_object('provider', p_provider, 'ip_bucket', left(p_ip_bucket, 80)));
end;
$$;

revoke execute on function
  internal.record_provider_status(public.notification_channel, text, text, text, timestamptz),
  internal.dead_letter_after_send(public.notifications, text, text),
  internal.record_webhook_signature_failure(text, text)
  from public, anon, authenticated, service_role;

create function public.svc_record_provider_status(
  p_channel public.notification_channel, p_provider_message_id text, p_status text,
  p_error_code text default null, p_occurred_at timestamptz default null
) returns text
  language sql security definer
  set search_path = ''
as $$ select internal.record_provider_status(p_channel, p_provider_message_id, p_status, p_error_code, p_occurred_at); $$;

create function public.svc_record_webhook_signature_failure(p_provider text, p_ip_bucket text) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.record_webhook_signature_failure(p_provider, p_ip_bucket); $$;

revoke execute on function
  public.svc_record_provider_status(public.notification_channel, text, text, text, timestamptz),
  public.svc_record_webhook_signature_failure(text, text)
  from public, anon, authenticated;
grant execute on function
  public.svc_record_provider_status(public.notification_channel, text, text, text, timestamptz),
  public.svc_record_webhook_signature_failure(text, text)
  to service_role;
