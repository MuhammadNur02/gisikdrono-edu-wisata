-- The claim functions take at most the rows they are asked for (review of the payments_poll flake on PR #82; Task
-- P3.9.02, P3.11.01, P3.11.04; docs/Security.md EP-02, MON-04).
--
-- The cause. internal.payments_to_poll, internal.claim_notifications and internal.claim_security_alerts each claimed
-- with `update t set … where t.id in (select … order by … limit n for update skip locked)`. The planner turns that IN
-- into a semi join, and when it picks a nested loop with the locking sub-select on the inner side, that sub-select is
-- rescanned once per outer row. Each rescan locks again: the rows this same statement has already updated come back
-- as self-modified, LockRows skips them, and LIMIT hands out the next candidates instead, which the outer row then
-- matches and updates too. So one statement could claim every candidate. Which plan is chosen depends on the tables'
-- statistics, which is why payments_poll.sql failed in one CI run ("more than one row returned by a subquery") and
-- passed in the next. It needs no concurrency: a single caller is enough. In production it meant a payments-poll run
-- asking Midtrans about more orders than its batch, and an outbox or alert worker leasing more rows than it sends.
--
-- The fix. The candidates are picked once, in a MATERIALIZED CTE, and the update joins that CTE: a CTE is evaluated a
-- single time, and a rescan of it reads its stored rows rather than locking again. Nothing else in the three functions
-- changes; their grants stay (create or replace keeps them). internal.expire_stale_bookings and
-- internal.close_past_bookings lock in a cursor loop, not under IN, and are not affected.
--
-- supabase/tests/claim_limits.sql runs each claim under the default planner and under settings that force the
-- rescanning plan.


-- Replaces the 20261024120100 version.
create or replace function internal.payments_to_poll(p_limit integer) returns table (order_id text, reason text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  -- A payment made just before its hold's deadline can settle a little after it, and a late settlement still revives
  -- the booking or puts it under review, so an attempt is asked until a day past the deadline.
  asked_after_deadline constant interval := interval '24 hours';
  -- Younger than this, the visitor is still paying and the webhook usually comes first.
  still_paying constant interval := interval '2 minutes';
begin
  perform internal.require_server_caller('payments_to_poll');
  return query
  with picked_open as materialized (
    select o.id from public.payments o join public.bookings b on b.id = o.booking_id
    where o.provider = 'midtrans' and o.status = 'pending' and o.created_at < now() - still_paying
      and now() < b.expires_at + asked_after_deadline
    order by o.last_polled_at nulls first, o.created_at
    limit p_limit
    for update of o skip locked),
  asked_open as (
    update public.payments p set last_polled_at = now()
    from picked_open
    where p.id = picked_open.id
    returning p.order_id),
  picked_paid as materialized (
    select s.id from public.payments s join public.bookings b on b.id = s.booking_id
    where s.provider = 'midtrans' and s.status = 'settled' and b.status in ('paid', 'checked_in')
      and (not b.needs_review or b.review_reason = 'REVENUE_RULE_REFUSED')
      and coalesce(s.settlement_time, s.updated_at) < now() - still_paying
      and (exists (select 1 from public.booking_legs l
                   where l.booking_id = b.id and l.status in ('reserved', 'checked_in')
                     and not exists (select 1 from public.tickets_qr t where t.booking_leg_id = l.id))
           or not exists (select 1 from public.revenue_share_entries e
                          where e.booking_id = b.id and e.entry_type = 'settlement'))
    order by s.last_polled_at nulls first, coalesce(s.settlement_time, s.updated_at)
    limit p_limit
    for update of s skip locked),
  asked_paid as (
    update public.payments p set last_polled_at = now()
    from picked_paid
    where p.id = picked_paid.id
    returning p.order_id)
  select asked_open.order_id, 'open'::text from asked_open
  union all
  select asked_paid.order_id, 'paid_incomplete'::text from asked_paid;
end;
$$;


-- Replaces the 20261024120000 version: only its final claim changes.
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
  with picked as materialized (
    select due.id from public.notifications due
    where due.status in ('queued', 'failed') and due.dead_at is null and due.next_attempt_at <= now()
      and due.template = any(p_templates)
    order by due.next_attempt_at
    limit p_limit
    for update skip locked)
  update public.notifications n set status = 'sending', locked_at = now(), attempts = n.attempts + 1
  from picked
  where n.id = picked.id
  returning n.*;
end;
$$;


-- Replaces the 20261024120200 version.
create or replace function internal.claim_security_alerts(p_limit integer)
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
  with picked as materialized (
    select due.id from public.security_alerts due
    where due.severity in ('high', 'critical') and due.acknowledged_at is null and due.notified_at is null
      and (due.delivery_claimed_at is null or due.delivery_claimed_at < now() - lease)
    order by due.last_seen_at
    limit p_limit
    for update skip locked)
  update public.security_alerts a set delivery_claimed_at = now()
  from picked
  where a.id = picked.id
  returning a.id, a.rule, a.severity, a.last_seen_at;
end;
$$;
