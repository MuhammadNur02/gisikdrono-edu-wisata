-- Follow-up of the last review of PR #109, item 2 (docs/PRD.md FR-POST-07, §9.4 fail_notification): a D-1 reminder
-- whose day the booking no longer visits (its leg moved, released or in a session the weather stopped since the row
-- was queued) is refused by the worker as `stale_day`. That refusal is a normal outcome of the booking changing, not a
-- fault, so the row is cancelled the way the claim cancels a row of a switched-off channel (`channel_disabled`,
-- 20261024120000): `status = 'cancelled'`, no `dead_at`, no `notification_dead` event or alert.


-- ===== fail_notification =====

-- Replaces the 20261024120000 version: a refusal named in outcome_codes cancels the row. Everything else is unchanged.
create or replace function internal.fail_notification(p_id uuid, p_error_code text, p_error text, p_permanent boolean)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  backoff_minutes constant integer[] := array[1, 5, 15, 60, 240];
  credential_errors constant text[] := array['meta_190', 'http_401'];
  -- The worker's refusals that are outcomes of the booking, not faults (src/server/services/outbox-messages.ts).
  outcome_codes constant text[] := array['stale_day'];
  message public.notifications;
  is_credential_error boolean := p_error_code = any (credential_errors);
begin
  select * into message from public.notifications n where n.id = p_id and n.status = 'sending' for update;
  if not found then
    return;
  end if;
  if p_error_code = any (outcome_codes) then
    update public.notifications n set status = 'cancelled', locked_at = null,
      last_error_code = left(p_error_code, 60), last_error = left(p_error, 200)
    where n.id = message.id;
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
