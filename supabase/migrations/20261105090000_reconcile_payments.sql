-- Task P3.9.03 (docs/Security.md §3.7; REC-01, REC-05, AUD-03, PAY-14): the nightly reconciliation. pg_cron calls
-- POST /api/jobs/reconcile-payments at 02:30 WIB (0007). The route lists the orders to look at
-- (svc_payments_to_reconcile), asks the Status API about each one and stores and applies its answer exactly as the
-- payments poll does (a poll event, applied by apply_payment_event), then hands what it saw to svc_reconcile_payments,
-- which writes one reconciliation_runs row (source nightly) and its reconciliation_issues:
--
--   window A  an open Midtrans attempt (initiated or pending) of the last 72 h, which the answer just applied
--   window B  a settled or partly refunded Midtrans payment of the last 7 days, re-verified: Midtrans' status, its
--             amount and its refunds against ours (status_disagreement, amount_mismatch); a paid order Midtrans no
--             longer knows is a high status_disagreement
--   invariants  one paid invoice per settled payment (invoice_mismatch, new), at most one settled payment per booking
--             (duplicate_settlement), the ledger of every paid booking equal to what it paid less what was refunded
--             and less the Midtrans fees of its weather refunds, the very sum recap_invariant reads
--             (ledger_sum_mismatch), every paid booking with a ticket ten minutes on (paid_without_tickets), no issued
--             ticket on a booking that is neither paid nor checked in (ticket_without_payment), and no session from
--             today on holding more visitors than its capacity (capacity_exceeded, new)
--   chains    internal.verify_audit_chain() and internal.verify_ledger_chain(), walked once by check_chains, which
--             anomaly_chains (the hourly check of anomaly-scan) now reads too: a break is a critical chain_broken
--             alert and a chain_broken issue, and each chain's verdict is kept on the run
--
-- An issue is not raised again while an open one says the same thing about the same booking and payment; a changed
-- figure is a new issue. A run that wrote new issues raises one reconciliation_digest alert for its Jakarta day, high
-- or critical, which the outbox job's alert sender mails to SECURITY_ALERT_EMAIL (rule, severity and time only; the
-- issues stay on /dashboard/finance/reconciliation). Nothing here writes a status, money or quota column: the answers
-- were applied by apply_payment_event before the run is recorded. The run also counts the orders of both windows that
-- went unasked or unanswered (orders_not_checked), which the route records as a failed run, asked again next night.


-- ===== The issue types of the nightly run =====

-- The union of every earlier list (20261104230100) and the two invariants that had no type yet.
alter table public.reconciliation_issues drop constraint reconciliation_issues_issue_type_check;
alter table public.reconciliation_issues add constraint reconciliation_issues_issue_type_check
  check (issue_type in ('paid_without_tickets', 'ticket_without_payment', 'amount_mismatch', 'status_disagreement',
                        'pending_beyond_ttl', 'ledger_sum_mismatch', 'chain_broken', 'payout_mismatch',
                        'duplicate_settlement', 'unknown_order', 'manual_transfer_unmatched', 'invoice_mismatch',
                        'capacity_exceeded'));


-- ===== The chains, walked once =====

-- Both chains verified, and a critical chain_broken alert for each broken one, as anomaly_chains raised them
-- (20261029080100), so the hourly check and the nightly run open the same alert.
create function internal.check_chains(out audit jsonb, out ledger jsonb, out raised integer)
  language plpgsql
  set search_path = ''
as $$
begin
  audit := internal.verify_audit_chain();
  ledger := internal.verify_ledger_chain();
  raised := 0;
  if not (audit ->> 'ok')::boolean then
    perform internal.raise_anomaly('chain_broken', 'critical', 'audit_logs', 'Rantai audit rusak', audit);
    raised := raised + 1;
  end if;
  if not (ledger ->> 'ok')::boolean then
    perform internal.raise_anomaly('chain_broken', 'critical', 'revenue_share_entries', 'Rantai buku besar rusak', ledger);
    raised := raised + 1;
  end if;
end;
$$;
revoke execute on function internal.check_chains() from public, anon, authenticated, service_role;

-- Replaces the 20261029080100 version with the shared walk; what it raises and returns is unchanged.
create or replace function internal.anomaly_chains() returns integer
  language sql
  set search_path = ''
as $$ select c.raised from internal.check_chains() as c; $$;


-- ===== What a paid booking's ledger must hold =====

-- What was refunded of a booking's money: the refunds of the payment its settlement rows name, or of every payment but
-- a duplicate while it has none. Taken out of recap_invariant (20261104080200) unchanged, so the recap and the nightly
-- run read one sum.
create function internal.booking_refunded(p_booking_id uuid) returns bigint
  language sql stable
  set search_path = ''
as $$
  select coalesce((select sum(p.refunded_amount) from public.payments p
                   where p.booking_id = p_booking_id
                     and (p.id in (select e.payment_id from public.revenue_share_entries e
                                   where e.booking_id = p_booking_id and e.entry_type = 'settlement')
                          or (p.status <> 'duplicate'
                              and not exists (select 1 from public.revenue_share_entries e
                                              where e.booking_id = p_booking_id and e.entry_type = 'settlement')))),
                  0)::bigint;
$$;
revoke execute on function internal.booking_refunded(uuid) from public, anon, authenticated, service_role;

-- Replaces the 20261104080200 version: the refunded sum now comes from booking_refunded. Its answer is unchanged.
create or replace function internal.recap_invariant(p_from date, p_to date) returns jsonb
  language sql stable
  set search_path = ''
as $$
  with paid as (
    select b.id, b.total_amount, internal.booking_refunded(b.id) as refunded,
           internal.weather_refund_fees(b.id) as weather_fees,
           coalesce((select sum(e.amount) from public.revenue_share_entries e where e.booking_id = b.id), 0) as ledger
    from public.bookings b
    where b.paid_at is not null
      and (b.paid_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  )
  select jsonb_build_object(
    'bookings', count(*),
    'expected', coalesce(sum(total_amount - refunded - weather_fees), 0)::bigint,
    'ledger', coalesce(sum(ledger), 0)::bigint,
    'weather_refund_fees', coalesce(sum(weather_fees), 0)::bigint,
    'mismatched_bookings', count(*) filter (where ledger <> total_amount - refunded - weather_fees))
  from paid;
$$;


-- ===== The orders the run asks Midtrans about =====

-- Window A and window B. p_young leaves out what is younger: the listing skips an attempt the visitor is still paying
-- (2 min, as the poll does), and the count of unchecked orders at the end of a run skips what came into a window while
-- the run was asking (5 min, beyond the route's 60 s).
create function internal.reconciliation_window(p_young interval)
  returns table (order_id text, reason text, since timestamptz)
  language sql stable
  set search_path = ''
as $$
  select p.order_id, 'open', p.created_at
  from public.payments p
  where p.provider = 'midtrans' and p.status in ('initiated', 'pending')
    and p.created_at >= now() - interval '72 hours' and p.created_at < now() - p_young
  union all
  select p.order_id, 'paid', coalesce(p.settlement_time, p.created_at)
  from public.payments p
  where p.provider = 'midtrans' and p.status in ('settled', 'partially_refunded')
    and coalesce(p.settlement_time, p.created_at) >= now() - interval '7 days'
    and coalesce(p.settlement_time, p.created_at) < now() - p_young;
$$;
revoke execute on function internal.reconciliation_window(interval) from public, anon, authenticated, service_role;

-- At most p_limit orders, the open ones first, each window oldest first.
create function internal.payments_to_reconcile(p_limit integer) returns table (order_id text, reason text)
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('payments_to_reconcile');
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'a reconciliation lists 1 to 200 orders' using errcode = '22023';
  end if;
  return query
  select w.order_id, w.reason from internal.reconciliation_window(interval '2 minutes') as w
  order by w.reason = 'paid', w.since, w.order_id
  limit p_limit;
end;
$$;
revoke execute on function internal.payments_to_reconcile(integer) from public, anon, authenticated, service_role;


-- ===== What the route saw =====

-- p_looks is [{order_id, outcome, event_id}], each order of a payment once, at most 500: outcome answered names the
-- poll event the answer was stored as (event_id, of that very order), not_found is Midtrans' 404, unanswered an order
-- the Status API did not answer. Anything else is refused, so the run reads only answers the database stored.
create function internal.check_reconciliation_looks(p_looks jsonb) returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  max_looks constant integer := 500;
begin
  if jsonb_typeof(p_looks) is distinct from 'array' or jsonb_array_length(p_looks) > max_looks then
    raise exception 'a reconciliation run reports at most % looks', max_looks using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_looks) as l
             where jsonb_typeof(l) <> 'object'
                or coalesce(l ->> 'outcome', '') not in ('answered', 'not_found', 'unanswered')
                or not exists (select 1 from public.payments p where p.order_id = l ->> 'order_id')
                or ((l ->> 'outcome' = 'answered')
                    <> exists (select 1 from public.payment_events e
                               where e.id = case when l ->> 'event_id' ~ '^[0-9]{1,18}$'
                                                 then (l ->> 'event_id')::bigint end
                                 and e.order_id = l ->> 'order_id' and e.source = 'poll')))
     or (select count(distinct l ->> 'order_id') from jsonb_array_elements(p_looks) as l)
        <> jsonb_array_length(p_looks) then
    raise exception 'each look names a payment''s order once, its outcome, and the poll event of an answer'
      using errcode = '22023';
  end if;
end;
$$;
revoke execute on function internal.check_reconciliation_looks(jsonb) from public, anon, authenticated, service_role;

-- What Midtrans' stored answers say against our payments, after they were applied: (issue_type, severity, booking_id,
-- payment_id, details). Details name Midtrans' figures as the statement import does (midtrans_status, midtrans_amount,
-- our_status, our_amount), so the dashboard shows both sides; a figure it cannot read is left out.
create function internal.reconcile_look_findings(p_looks jsonb)
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, details jsonb)
  language sql stable
  set search_path = ''
as $$
  with looked as (
    select p.id as payment_id, p.booking_id, p.order_id, p.status as ours, p.gross_amount, p.refunded_amount,
           l ->> 'outcome' as outcome, e.payload,
           internal.midtrans_payment_status(e.payload ->> 'transaction_status', e.payload ->> 'fraud_status') as stated,
           case when e.payload ->> 'gross_amount' ~ '^[0-9]{1,15}(\.0{1,2})?$'
                then split_part(e.payload ->> 'gross_amount', '.', 1)::bigint end as stated_amount
    from jsonb_array_elements(p_looks) as l
    join public.payments p on p.order_id = l ->> 'order_id'
    left join public.payment_events e
      on l ->> 'outcome' = 'answered' and e.order_id = p.order_id
     and e.id = case when l ->> 'event_id' ~ '^[0-9]{1,18}$' then (l ->> 'event_id')::bigint end
    where l ->> 'outcome' in ('answered', 'not_found')
  ), facts as (
    select k.*, jsonb_strip_nulls(jsonb_build_object(
             'order_id', k.order_id, 'midtrans_status', coalesce(k.payload ->> 'transaction_status', 'not_found'),
             'midtrans_amount', k.stated_amount, 'our_status', k.ours, 'our_amount', k.gross_amount)) as said
    from looked k
  )
  -- Money we hold as taken for an order Midtrans has no transaction for.
  select 'status_disagreement', 'high'::public.alert_severity, f.booking_id, f.payment_id, f.said
  from facts f
  where f.outcome = 'not_found' and f.ours in ('settled', 'partially_refunded', 'refunded', 'disputed')
  union all
  select 'amount_mismatch', 'high'::public.alert_severity, f.booking_id, f.payment_id, f.said
  from facts f
  where f.outcome = 'answered'
    and not internal.midtrans_amount_matches(f.payload ->> 'gross_amount', f.payload ->> 'currency', f.gross_amount)
  union all
  select 'status_disagreement',
         (case when f.stated in ('settled', 'refunded', 'partially_refunded', 'disputed')
                    or f.ours in ('settled', 'refunded', 'partially_refunded', 'disputed', 'duplicate') then 'high'
               else 'medium' end)::public.alert_severity,
         f.booking_id, f.payment_id, f.said
  from facts f
  where f.outcome = 'answered' and not coalesce(internal.statement_status_agrees(f.stated, f.ours), false)
  union all
  -- Midtrans gave back more than the books show refunded: a refund nobody recorded yet (record_refund).
  select 'amount_mismatch', 'high'::public.alert_severity, f.booking_id, f.payment_id,
         f.said || jsonb_build_object('reason', 'refund_not_recorded',
                                      'midtrans_refunded', internal.midtrans_refund_total(f.payload),
                                      'our_refunded', f.refunded_amount)
  from facts f
  where f.outcome = 'answered' and coalesce(internal.statement_status_agrees(f.stated, f.ours), false)
    and coalesce(internal.midtrans_refund_total(f.payload), 0) > f.refunded_amount;
$$;
revoke execute on function internal.reconcile_look_findings(jsonb) from public, anon, authenticated, service_role;


-- ===== The invariants =====

-- docs/Security.md §3.7: what must hold of money, tickets and seats whatever Midtrans says.
create function internal.reconcile_invariant_findings()
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, details jsonb)
  language sql stable
  set search_path = ''
as $$
  select 'invoice_mismatch', 'high'::public.alert_severity, p.booking_id, p.id,
         jsonb_build_object('order_id', p.order_id, 'paid_invoices', invoiced.paid)
  from public.payments p
  cross join lateral (select count(*)::integer as paid from public.invoices i
                      where i.payment_id = p.id and i.status = 'paid') as invoiced
  where p.status in ('settled', 'partially_refunded') and invoiced.paid <> 1
  union all
  select 'duplicate_settlement', 'high'::public.alert_severity, p.booking_id, null::uuid,
         jsonb_build_object('settled_payments', count(*))
  from public.payments p
  where p.status in ('settled', 'partially_refunded')
  group by p.booking_id
  having count(*) > 1
  union all
  select 'ledger_sum_mismatch', 'high'::public.alert_severity, sums.booking_id, null::uuid,
         jsonb_build_object('expected', sums.expected, 'ledger', sums.ledger, 'gap', sums.ledger - sums.expected)
  from (select b.id as booking_id,
               b.total_amount - internal.booking_refunded(b.id) - internal.weather_refund_fees(b.id) as expected,
               coalesce((select sum(e.amount) from public.revenue_share_entries e where e.booking_id = b.id),
                        0)::bigint as ledger
        from public.bookings b
        where b.paid_at is not null) as sums
  where sums.ledger <> sums.expected
  union all
  -- Ten minutes, as the anomaly scan waits: the settlement writes the tickets in its own transaction.
  select 'paid_without_tickets', 'critical'::public.alert_severity, b.id, null::uuid, '{}'::jsonb
  from public.bookings b
  where b.status = 'paid' and b.paid_at < now() - interval '10 minutes'
    and not exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
  union all
  select 'ticket_without_payment', 'critical'::public.alert_severity, t.booking_id, null::uuid,
         jsonb_build_object('ticket_id', t.id, 'booking_status', b.status)
  from public.tickets_qr t
  join public.bookings b on b.id = t.booking_id
  where t.status = 'issued' and b.status not in ('paid', 'checked_in')
  union all
  select 'capacity_exceeded', 'high'::public.alert_severity, null::uuid, null::uuid,
         jsonb_build_object('session_id', s.id, 'capacity', s.capacity, 'reserved_pax', s.reserved_pax,
                            'legs_pax', legs.pax)
  from public.visit_sessions s
  cross join lateral (select coalesce(sum(l.pax_count), 0)::integer as pax from public.booking_legs l
                      where l.visit_session_id = s.id and l.status in ('reserved', 'checked_in')) as legs
  where s.session_date >= public.today_jkt() and (s.reserved_pax > s.capacity or legs.pax > s.capacity);
$$;
revoke execute on function internal.reconcile_invariant_findings() from public, anon, authenticated, service_role;

-- A broken chain as an issue of the run, named by its table and its first broken row.
create function internal.chain_findings(p_audit jsonb, p_ledger jsonb)
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, details jsonb)
  language sql immutable
  set search_path = ''
as $$
  select 'chain_broken', 'critical'::public.alert_severity, null::uuid, null::uuid,
         jsonb_strip_nulls(jsonb_build_object('chain', c.chain, 'first_broken_id', c.verdict -> 'first_broken_id'))
  from (values ('audit_logs', p_audit), ('revenue_share_entries', p_ledger)) as c(chain, verdict)
  where not coalesce((c.verdict ->> 'ok')::boolean, false);
$$;
revoke execute on function internal.chain_findings(jsonb, jsonb) from public, anon, authenticated, service_role;


-- ===== Writing the run =====

-- An issue still open that says the same about the same booking and payment.
create function internal.reconciliation_issue_open(p_issue_type text, p_booking_id uuid, p_payment_id uuid,
  p_details jsonb) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.reconciliation_issues o
                 where o.resolved_at is null and o.issue_type = p_issue_type
                   and o.booking_id is not distinct from p_booking_id
                   and o.payment_id is not distinct from p_payment_id
                   and o.details = p_details);
$$;
revoke execute on function internal.reconciliation_issue_open(text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- The run's issues, none an open one already says: how many were found, how many written, the worst written and the
-- written ones by type.
create function internal.insert_reconciliation_findings(p_run_id uuid, p_looks jsonb, p_audit jsonb, p_ledger jsonb,
  out raised integer, out written integer, out worst public.alert_severity, out by_type jsonb)
  language plpgsql
  set search_path = ''
as $$
begin
  with findings as (
    select * from internal.reconcile_look_findings(p_looks)
    union all
    select * from internal.reconcile_invariant_findings()
    union all
    select * from internal.chain_findings(p_audit, p_ledger)
  ), new_issues as (
    insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
    select p_run_id, f.booking_id, f.payment_id, f.issue_type, f.severity, f.details
    from findings f
    where not internal.reconciliation_issue_open(f.issue_type, f.booking_id, f.payment_id, f.details)
    returning reconciliation_issues.issue_type, reconciliation_issues.severity
  )
  select (select count(*) from findings)::integer, (select count(*) from new_issues)::integer,
         (select max(n.severity) from new_issues n),
         coalesce((select jsonb_object_agg(t.issue_type, t.issues)
                   from (select n.issue_type, count(*) as issues from new_issues n group by n.issue_type) as t),
                  '{}'::jsonb)
  into raised, written, worst, by_type;
end;
$$;
revoke execute on function internal.insert_reconciliation_findings(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- The orders of both windows no answer of this run covers, older than the run.
create function internal.orders_not_reconciled(p_looks jsonb) returns integer
  language sql stable
  set search_path = ''
as $$
  select count(*)::integer from internal.reconciliation_window(interval '5 minutes') as w
  where not exists (select 1 from jsonb_array_elements(p_looks) as l
                    where l ->> 'order_id' = w.order_id and l ->> 'outcome' in ('answered', 'not_found'));
$$;
revoke execute on function internal.orders_not_reconciled(jsonb) from public, anon, authenticated, service_role;

-- One digest alert per Jakarta day with new issues, at least high so the alert sender mails it.
create function internal.raise_reconciliation_digest(p_run_id uuid, p_written integer,
  p_worst public.alert_severity, p_by_type jsonb) returns void
  language sql
  set search_path = ''
as $$
  select internal.raise_anomaly('reconciliation_digest', greatest('high'::public.alert_severity, p_worst),
    public.today_jkt()::text, 'Rekonsiliasi pembayaran menemukan selisih baru',
    jsonb_build_object('run_id', p_run_id, 'new_issues', p_written, 'by_type', p_by_type,
                       'open_issues', (select count(*) from public.reconciliation_issues i where i.resolved_at is null)));
$$;
revoke execute on function internal.raise_reconciliation_digest(uuid, integer, public.alert_severity, jsonb)
  from public, anon, authenticated, service_role;

-- {run_id, payments_checked, orders_not_checked, issues_found, issues_already_open, ledger_chain_ok, audit_chain_ok}.
create function internal.reconcile_payments(p_looks jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  chains record;
  counted record;
  new_run_id uuid;
  checked integer;
  not_checked integer;
begin
  perform internal.require_server_caller('reconcile_payments');
  perform internal.check_reconciliation_looks(p_looks);
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.actor_role', 'cron'));
  select c.audit, c.ledger into chains from internal.check_chains() as c;
  checked := (select count(*) from jsonb_array_elements(p_looks) as l
              where l ->> 'outcome' in ('answered', 'not_found'))::integer;
  insert into public.reconciliation_runs (run_date, source, payments_checked, ledger_chain_ok, audit_chain_ok)
  values (public.today_jkt(), 'nightly', checked, (chains.ledger ->> 'ok')::boolean, (chains.audit ->> 'ok')::boolean)
  returning id into new_run_id;
  select i.raised, i.written, i.worst, i.by_type into counted
  from internal.insert_reconciliation_findings(new_run_id, p_looks, chains.audit, chains.ledger) as i;
  not_checked := internal.orders_not_reconciled(p_looks);
  update public.reconciliation_runs
  set issues_found = counted.written, finished_at = now(),
      summary = jsonb_build_object(
        'not_found', (select count(*) from jsonb_array_elements(p_looks) as l where l ->> 'outcome' = 'not_found'),
        'unanswered', (select count(*) from jsonb_array_elements(p_looks) as l where l ->> 'outcome' = 'unanswered'),
        'orders_not_checked', not_checked, 'issues_already_open', counted.raised - counted.written,
        'by_type', counted.by_type,
        'audit_rows_checked', chains.audit -> 'checked', 'ledger_rows_checked', chains.ledger -> 'checked')
  where id = new_run_id;
  if counted.written > 0 then
    perform internal.raise_reconciliation_digest(new_run_id, counted.written, counted.worst, counted.by_type);
  end if;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('run_id', new_run_id, 'payments_checked', checked, 'orders_not_checked', not_checked,
                            'issues_found', counted.written, 'issues_already_open', counted.raised - counted.written,
                            'ledger_chain_ok', (chains.ledger ->> 'ok')::boolean,
                            'audit_chain_ok', (chains.audit ->> 'ok')::boolean);
end;
$$;
revoke execute on function internal.reconcile_payments(jsonb) from public, anon, authenticated, service_role;


-- ===== The route's entry points =====

create function public.svc_payments_to_reconcile(p_limit integer) returns table (order_id text, reason text)
  language sql security definer
  set search_path = ''
as $$ select * from internal.payments_to_reconcile(p_limit); $$;

create function public.svc_reconcile_payments(p_looks jsonb) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.reconcile_payments(p_looks); $$;

revoke execute on function public.svc_payments_to_reconcile(integer), public.svc_reconcile_payments(jsonb)
  from public, anon, authenticated;
grant execute on function public.svc_payments_to_reconcile(integer), public.svc_reconcile_payments(jsonb)
  to service_role;
