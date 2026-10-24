-- Task P3.11.08 (docs/Security.md OPS-06, MON-03): high and critical alerts reach SECURITY_ALERT_EMAIL out of band.
-- The process-notifications job sends each one itself, straight to the email provider rather than through the
-- outbox, so a stalled or switched-off outbox cannot silence them. A claim leases an alert for five minutes
-- (delivery_claimed_at), so two runs never send one at once; notified_at is set only once its email went out, so a
-- run killed between the claim and the send leaves the alert to the next run when its lease ends (independent review
-- of PR #50, M2). A failed send keeps its lease, so the next try waits five minutes: an email provider refusing the
-- server's key refuses every alert, and /api/health already answers 503 for it. An alert raised again clears
-- notified_at (its upserts do), so it is sent again, and one raised again during its own send is not taken as sent.

alter table public.security_alerts add column delivery_claimed_at timestamptz;

create function internal.claim_security_alerts(p_limit integer)
  returns table (id uuid, rule text, severity public.alert_severity, last_seen_at timestamptz)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  lease constant interval := interval '5 minutes';
begin
  perform internal.require_server_caller('claim_security_alerts');
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'a claim takes 1 to 50 alerts' using errcode = '22023';
  end if;
  return query
  update public.security_alerts a set delivery_claimed_at = now()
  where a.id in (
    select due.id from public.security_alerts due
    where due.severity in ('high', 'critical') and due.acknowledged_at is null and due.notified_at is null
      and (due.delivery_claimed_at is null or due.delivery_claimed_at < now() - lease)
    order by due.last_seen_at
    limit p_limit
    for update skip locked)
  returning a.id, a.rule, a.severity, a.last_seen_at;
end;
$$;

-- The alert's email went out. It is sent, and its lease ends; but if it was raised again while the email was on its
-- way (its last_seen_at moved past the one the run claimed), the email told of the older raise, so only the lease
-- ends and the next run sends it again (independent review of PR #50).
create function internal.mark_security_alert_sent(p_id uuid, p_last_seen_at timestamptz) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('mark_security_alert_sent');
  update public.security_alerts a
  set notified_at = case when a.last_seen_at = p_last_seen_at then now() end, delivery_claimed_at = null
  where a.id = p_id;
end;
$$;

-- The alert's email did not go out: its lease starts again, so the next try waits five minutes instead of one.
create function internal.release_security_alert(p_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('release_security_alert');
  update public.security_alerts set delivery_claimed_at = now() where id = p_id and notified_at is null;
end;
$$;

create function public.svc_claim_security_alerts(p_limit integer)
  returns table (id uuid, rule text, severity public.alert_severity, last_seen_at timestamptz)
  language sql security definer
  set search_path = ''
as $$ select * from internal.claim_security_alerts(p_limit); $$;

create function public.svc_mark_security_alert_sent(p_id uuid, p_last_seen_at timestamptz) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.mark_security_alert_sent(p_id, p_last_seen_at); $$;

create function public.svc_release_security_alert(p_id uuid) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.release_security_alert(p_id); $$;

revoke execute on function internal.claim_security_alerts(integer),
  internal.mark_security_alert_sent(uuid, timestamptz), internal.release_security_alert(uuid),
  public.svc_claim_security_alerts(integer), public.svc_mark_security_alert_sent(uuid, timestamptz),
  public.svc_release_security_alert(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_claim_security_alerts(integer),
  public.svc_mark_security_alert_sent(uuid, timestamptz), public.svc_release_security_alert(uuid) to service_role;
