-- The outbox worker's three steps (docs/PRD.md §8.7.2, Task P3.11.01; docs/Security.md EP-02): claim a batch, then
-- mark each message sent or failed. api/jobs/process-notifications runs them through the svc_ wrappers. A message
-- with an OTP loses its code as soon as it is sent, given up or past the five minutes a code lives, so the outbox
-- never keeps a usable code.

-- Claims up to p_limit due messages of the given templates (the ones the application can send so far) and marks them
-- sending. A message left sending for ten minutes (a worker that died) is queued again first, and an OTP message
-- that is no longer worth sending is cancelled.
create function internal.claim_notifications(p_limit integer, p_templates public.notification_template[])
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

create function internal.complete_notification(p_id uuid, p_provider_message_id text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  update public.notifications n set status = 'sent', sent_at = now(), locked_at = null,
    provider_message_id = p_provider_message_id, last_error_code = null, last_error = null,
    params = case when n.template = 'phone_otp' then '{}'::jsonb else n.params end
  where n.id = p_id and n.status = 'sending';
end;
$$;

-- A failed send is tried again after 1, 5, 15, 60, then 240 minutes. After max_attempts tries, or at once for an
-- error the provider calls permanent, the message is dead: it stays failed with dead_at set and raises
-- notification_dead with an alert. p_error is the server's own short description, never the provider's text, which
-- may repeat the recipient.
create function internal.fail_notification(p_id uuid, p_error_code text, p_error text, p_permanent boolean)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  backoff_minutes constant integer[] := array[1, 5, 15, 60, 240];
  message public.notifications;
begin
  select * into message from public.notifications n where n.id = p_id and n.status = 'sending' for update;
  if not found then
    return;
  end if;

  if coalesce(p_permanent, false) or message.attempts >= message.max_attempts then
    update public.notifications n set status = 'failed', dead_at = now(), locked_at = null,
      last_error_code = left(p_error_code, 60), last_error = left(p_error, 200),
      params = case when n.template = 'phone_otp' then '{}'::jsonb else n.params end
    where n.id = message.id;
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('notification_dead', 'medium', 'notifications', message.id::text,
            jsonb_build_object('template', message.template, 'channel', message.channel,
                               'error_code', left(p_error_code, 60), 'attempts', message.attempts));
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('notification_dead', 'medium', format('notification_dead:%s:%s', message.template, message.channel),
            'Pesan outbox gagal terkirim dan berhenti dicoba',
            jsonb_build_object('template', message.template, 'channel', message.channel,
                               'error_code', left(p_error_code, 60)))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
    return;
  end if;

  update public.notifications n set status = 'failed', locked_at = null,
    last_error_code = left(p_error_code, 60), last_error = left(p_error, 200),
    next_attempt_at = now() + make_interval(mins => backoff_minutes[least(message.attempts, cardinality(backoff_minutes))])
  where n.id = message.id;
end;
$$;

revoke execute on function internal.claim_notifications(integer, public.notification_template[]),
  internal.complete_notification(uuid, text), internal.fail_notification(uuid, text, text, boolean)
  from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16).
create function public.svc_claim_notifications(p_limit integer, p_templates public.notification_template[])
  returns setof public.notifications
  language sql security definer
  set search_path = ''
as $$ select * from internal.claim_notifications(p_limit, p_templates); $$;

create function public.svc_complete_notification(p_id uuid, p_provider_message_id text) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.complete_notification(p_id, p_provider_message_id); $$;

create function public.svc_fail_notification(p_id uuid, p_error_code text, p_error text, p_permanent boolean)
  returns void
  language sql security definer
  set search_path = ''
as $$ select internal.fail_notification(p_id, p_error_code, p_error, p_permanent); $$;

revoke execute on function public.svc_claim_notifications(integer, public.notification_template[]),
  public.svc_complete_notification(uuid, text), public.svc_fail_notification(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.svc_claim_notifications(integer, public.notification_template[]),
  public.svc_complete_notification(uuid, text), public.svc_fail_notification(uuid, text, text, boolean)
  to service_role;
