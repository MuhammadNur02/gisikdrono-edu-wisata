-- Task P3.9.03 (docs/Security.md §3.7; REC-01, REC-05, AUD-03, PAY-14): the nightly reconciliation. pg_cron calls
-- POST /api/jobs/reconcile-payments at 02:30 WIB (0007). The route lists the orders to look at
-- (svc_payments_to_reconcile), asks the Status API about each one and stores and applies its answer exactly as the
-- payments poll does (a poll event, applied by apply_payment_event), then hands what it saw to svc_reconcile_payments,
-- which writes one reconciliation_runs row (source nightly) and its reconciliation_issues, and last walks the chains
-- in a step of its own (svc_reconcile_chains), so a slow walk never costs the run its record:
--
--   window A  an open Midtrans attempt (initiated or pending) of the last 72 h, which the answer just applied
--   window B  a settled or partly refunded Midtrans payment of the last 7 days, re-verified: Midtrans' status, its
--             amount and its refunds against what was recorded under Midtrans' word (internal.midtrans_recorded, the
--             measure note_refund_seen uses), so a bank-transfer refund Midtrans never made is no disagreement and a
--             Midtrans refund the books do not hold, or hold otherwise, is one; a paid order Midtrans no longer knows
--             is a high status_disagreement. The window takes turns by reconciliation_turns, never compared first,
--             so each night asks different payments and the whole window is asked within a few nights.
--   invariants  one invoice per settled payment, paid, or voided under a credit note once refunded
--             (invoice_mismatch, new), at most one settled payment per booking (duplicate_settlement), the ledger of
--             every paid booking equal to what it paid less what was refunded and less the Midtrans fees of its weather
--             refunds, the very sum recap_invariant reads (ledger_sum_mismatch), every paid booking not under review
--             with a ticket ten minutes on (paid_without_tickets), no issued ticket on a booking that is neither paid
--             nor checked in (ticket_without_payment), and no session from today on holding more visitors than its
--             capacity (capacity_exceeded, new)
--   chains    internal.verify_audit_chain() and internal.verify_ledger_chain(), walked once by check_chains, which
--             anomaly_chains (the hourly check of anomaly-scan) now reads too: a break is a critical chain_broken
--             alert and a chain_broken issue, and each chain's verdict is kept on the run
--
-- Each finding names its subject (type, booking, payment) and its facts, the figures that make it the finding it is.
-- It is not raised again while an open issue with the same subject holds those facts, or one closed as ignored in the
-- last 30 days holds its whole details; a changed fact is a new issue. The audit turn is taken only for the writes, never for the scans or the chain walk. A run that
-- wrote new issues raises one reconciliation_digest alert for its Jakarta day, high or critical, raised to critical by
-- a later run of the day that finds something critical, which the outbox job's alert sender mails to
-- SECURITY_ALERT_EMAIL (rule, severity and time only; the issues stay on /dashboard/finance/reconciliation). Nothing
-- here writes a status, money or quota column: the answers were applied by apply_payment_event before the run is
-- recorded. The run counts the orders whose ask went unanswered (the route records the run as failed) and those still
-- waiting their turn.
--
-- Review of PR #99, Info (decision of 2026-10-29): a nightly issue names Midtrans' status and amount in its details as
-- a statement issue does, so internal.insert_statement_issues (20261104210200) does not raise a statement row again
-- while a nightly issue of the same type is open for that payment with the same status and amount. The comment above
-- it ("an issue no statement opened ... a nightly one, hides nothing") no longer holds for those issues: identical
-- facts are raised once, from whichever side saw them first. The key gap of open_key_gap_issue still hides nothing.


-- ===== The issue types of the nightly run =====

-- The union of every earlier list (20261104230100) and the two invariants that had no type yet.
alter table public.reconciliation_issues drop constraint reconciliation_issues_issue_type_check;
alter table public.reconciliation_issues add constraint reconciliation_issues_issue_type_check
  check (issue_type in ('paid_without_tickets', 'ticket_without_payment', 'amount_mismatch', 'status_disagreement',
                        'pending_beyond_ttl', 'ledger_sum_mismatch', 'chain_broken', 'payout_mismatch',
                        'duplicate_settlement', 'unknown_order', 'manual_transfer_unmatched', 'invoice_mismatch',
                        'capacity_exceeded'));


-- ===== Window B takes turns =====

-- When the nightly run last compared a payment with an answer about its order (or Midtrans' 404). Kept apart from
-- payments (delta review of PR #105, M-B): a stamp there would move payments.updated_at, which the anomaly scan's
-- refund_volume rule and the look findings below read as the payment's own last change. Bookkeeping of the run alone:
-- written only by internal.reconcile_payments, read by internal.reconciliation_window, reached by no API role, so it
-- has RLS enabled and forced, every privilege revoked and no policy at all. Not audited: it holds no money and no
-- personal data, and an audit row per payment per night would say nothing anyone acts on.
create table public.reconciliation_turns (
  payment_id         uuid primary key references public.payments(id),
  last_reconciled_at timestamptz not null
);
create index reconciliation_turns_last_idx on public.reconciliation_turns (last_reconciled_at);
alter table public.reconciliation_turns enable row level security;
alter table public.reconciliation_turns force row level security;
revoke all on public.reconciliation_turns from anon, authenticated;


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

-- Window A and window B. p_young leaves out what is younger: an attempt the visitor is still paying (2 min, as the poll
-- does), or, when the run counts what waits, what came into a window while the run was asking (5 min, beyond the
-- route's 60 s). turn is when window B last compared the payment (reconciliation_turns).
create function internal.reconciliation_window(p_young interval)
  returns table (order_id text, reason text, since timestamptz, turn timestamptz)
  language sql stable
  set search_path = ''
as $$
  select p.order_id, 'open', p.created_at, null::timestamptz
  from public.payments p
  where p.provider = 'midtrans' and p.status in ('initiated', 'pending')
    and p.created_at >= now() - interval '72 hours' and p.created_at < now() - p_young
  union all
  select p.order_id, 'paid', coalesce(p.settlement_time, p.created_at), t.last_reconciled_at
  from public.payments p
  left join public.reconciliation_turns t on t.payment_id = p.id
  where p.provider = 'midtrans' and p.status in ('settled', 'partially_refunded')
    and coalesce(p.settlement_time, p.created_at) >= now() - interval '7 days'
    and coalesce(p.settlement_time, p.created_at) < now() - p_young;
$$;
revoke execute on function internal.reconciliation_window(interval) from public, anon, authenticated, service_role;

-- At most p_limit orders: every open one first, then window B by turn, never asked first, oldest first.
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
  order by w.reason = 'paid', w.turn nulls first, w.since, w.order_id
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

-- What Midtrans should say of a payment, from what was recorded under its word (p_recorded, midtrans_recorded): a
-- payment holding money reads as settled while nothing Midtrans made is recorded, refunded once that covers it whole,
-- partly refunded between. A bank-transfer refund leaves it settled at Midtrans, as apply_payment_status keeps it.
create function internal.expected_midtrans_status(p_payment public.payments, p_recorded bigint)
  returns public.payment_status
  language sql immutable
  set search_path = ''
as $$
  select case
    when p_payment.status not in ('settled', 'partially_refunded', 'refunded') then p_payment.status
    when p_recorded <= 0 then 'settled'
    when p_recorded >= p_payment.gross_amount then 'refunded'
    else 'partially_refunded'
  end::public.payment_status;
$$;
revoke execute on function internal.expected_midtrans_status(public.payments, bigint)
  from public, anon, authenticated, service_role;

-- The looks the run compares: Midtrans' 404s, and the answers no later event of the order superseded. The payment's
-- own updated_at is no test (third delta review of PR #105): lookAtOrder hands back the first event of a byte-identical
-- answer, and a payment changed on our side since (a bank-transfer refund, the poll's last_polled_at) would otherwise be
-- skipped every night. Only these take their payment's turn (L-2) and count as checked.
create function internal.compared_looks(p_looks jsonb)
  returns table (payment_id uuid, outcome text, event_id bigint)
  language sql stable
  set search_path = ''
as $$
  select p.id, l ->> 'outcome', e.id
  from jsonb_array_elements(p_looks) as l
  join public.payments p on p.order_id = l ->> 'order_id'
  left join public.payment_events e
    on l ->> 'outcome' = 'answered' and e.order_id = p.order_id
   and e.id = case when l ->> 'event_id' ~ '^[0-9]{1,18}$' then (l ->> 'event_id')::bigint end
  where l ->> 'outcome' = 'not_found'
     or (l ->> 'outcome' = 'answered' and e.id is not null
         and not exists (select 1 from public.payment_events later
                         where later.order_id = p.order_id and later.id > e.id));
$$;
revoke execute on function internal.compared_looks(jsonb) from public, anon, authenticated, service_role;

-- What Midtrans' stored answers say against our payments, after they were applied: (issue_type, severity, booking_id,
-- payment_id, facts, details). Facts name Midtrans' figures as the statement import does (order_id, midtrans_status,
-- midtrans_amount) and our status, so the dashboard shows both sides and the same difference is raised once; a figure
-- it cannot read is left out.
create function internal.reconcile_look_findings(p_looks jsonb)
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, facts jsonb,
                 details jsonb)
  language sql stable
  set search_path = ''
as $$
  with looked as (
    select p.id as payment_id, p.booking_id, p.order_id, p.status as ours, p.gross_amount,
           c.outcome, e.payload,
           internal.midtrans_payment_status(e.payload ->> 'transaction_status', e.payload ->> 'fraud_status') as stated,
           case when e.payload ->> 'gross_amount' ~ '^[0-9]{1,15}(\.0{1,2})?$'
                then split_part(e.payload ->> 'gross_amount', '.', 1)::bigint end as stated_amount,
           case when e.payload ->> 'transaction_status' = 'refund' then p.gross_amount
                else coalesce(internal.midtrans_refund_total(e.payload), 0) end as stated_refunded,
           recorded.amount as recorded,
           internal.expected_midtrans_status(p, recorded.amount) as expected
    from internal.compared_looks(p_looks) as c
    join public.payments p on p.id = c.payment_id
    cross join lateral (select internal.midtrans_recorded(p) as amount) as recorded
    left join public.payment_events e on e.id = c.event_id
  ), facts as (
    select k.*,
           jsonb_strip_nulls(jsonb_build_object(
             'order_id', k.order_id, 'midtrans_status', coalesce(k.payload ->> 'transaction_status', 'not_found'),
             'midtrans_amount', k.stated_amount, 'our_status', k.ours)) as said,
           jsonb_build_object('our_amount', k.gross_amount, 'our_midtrans_refunded', k.recorded) as ours_said
    from looked k
  )
  -- Money we hold as taken for an order Midtrans has no transaction for.
  select 'status_disagreement', 'high'::public.alert_severity, f.booking_id, f.payment_id, f.said,
         f.said || f.ours_said
  from facts f
  where f.outcome = 'not_found' and f.ours in ('settled', 'partially_refunded', 'refunded', 'disputed')
  union all
  select 'amount_mismatch', 'high'::public.alert_severity, f.booking_id, f.payment_id, f.said, f.said || f.ours_said
  from facts f
  where f.outcome = 'answered'
    and not internal.midtrans_amount_matches(f.payload ->> 'gross_amount', f.payload ->> 'currency', f.gross_amount)
  union all
  select 'status_disagreement',
         (case when f.stated in ('settled', 'refunded', 'partially_refunded', 'disputed')
                    or f.ours in ('settled', 'refunded', 'partially_refunded', 'disputed', 'duplicate') then 'high'
               else 'medium' end)::public.alert_severity,
         f.booking_id, f.payment_id, f.said, f.said || f.ours_said
  from facts f
  where f.outcome = 'answered' and not coalesce(internal.statement_status_agrees(f.stated, f.expected), false)
  union all
  -- The statuses agree but the refunds do not, either way: Midtrans reports more than is recorded under its word (one
  -- nobody recorded, or one beside a bank transfer already made), or less than was booked as Midtrans'.
  select 'amount_mismatch', 'high'::public.alert_severity, f.booking_id, f.payment_id,
         jsonb_build_object('order_id', f.order_id, 'reason', 'refund_amount', 'midtrans_refunded', f.stated_refunded,
                            'our_midtrans_refunded', f.recorded, 'our_status', f.ours),
         f.said || f.ours_said || jsonb_build_object('reason', 'refund_amount', 'midtrans_refunded', f.stated_refunded)
  from facts f
  where f.outcome = 'answered' and coalesce(internal.statement_status_agrees(f.stated, f.expected), false)
    and f.ours <> 'duplicate' and f.stated_refunded <> f.recorded;
$$;
revoke execute on function internal.reconcile_look_findings(jsonb) from public, anon, authenticated, service_role;


-- ===== The invariants =====

-- docs/Security.md §3.7: what must hold of money, tickets and seats whatever Midtrans says. A refund voids the paid
-- invoice under a credit note (book_refund_request, record_refund) and a leg's weather refund leaves it paid, so a
-- refunded payment keeps exactly one invoice, paid or credited.
create function internal.reconcile_invariant_findings()
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, facts jsonb,
                 details jsonb)
  language sql stable
  set search_path = ''
as $$
  select 'invoice_mismatch', 'high'::public.alert_severity, p.booking_id, p.id, invoiced.said, invoiced.said
  from public.payments p
  cross join lateral (
    select count(*) filter (where i.status = 'paid') as paid,
           count(*) filter (where i.status = 'void' and i.credit_note_number is not null) as credited
    from public.invoices i where i.payment_id = p.id) as counted
  cross join lateral (select jsonb_build_object('order_id', p.order_id, 'paid_invoices', counted.paid,
                                                'credited_invoices', counted.credited) as said) as invoiced
  where (p.status = 'settled' and counted.paid <> 1)
     or (p.status in ('partially_refunded', 'refunded') and counted.paid + counted.credited <> 1)
  union all
  select 'duplicate_settlement', 'high'::public.alert_severity, p.booking_id, null::uuid,
         jsonb_build_object('settled_payments', count(*)), jsonb_build_object('settled_payments', count(*))
  from public.payments p
  where p.status in ('settled', 'partially_refunded')
  group by p.booking_id
  having count(*) > 1
  union all
  select 'ledger_sum_mismatch', 'high'::public.alert_severity, sums.booking_id, null::uuid,
         jsonb_build_object('expected', sums.expected, 'ledger', sums.ledger),
         jsonb_build_object('expected', sums.expected, 'ledger', sums.ledger, 'gap', sums.ledger - sums.expected)
  from (select b.id as booking_id,
               b.total_amount - internal.booking_refunded(b.id) - internal.weather_refund_fees(b.id) as expected,
               coalesce((select sum(e.amount) from public.revenue_share_entries e where e.booking_id = b.id),
                        0)::bigint as ledger
        from public.bookings b
        where b.paid_at is not null) as sums
  where sums.ledger <> sums.expected
  union all
  -- Ten minutes, as the anomaly scan waits: the settlement writes the tickets in its own transaction. A booking under
  -- review already waits for resolve_booking_review. Its legs are what the tickets were owed to.
  select 'paid_without_tickets', 'critical'::public.alert_severity, b.id, null::uuid, legs.said, legs.said
  from public.bookings b
  cross join lateral (select jsonb_build_object('legs', count(*), 'pax', coalesce(sum(l.pax_count), 0)) as said
                      from public.booking_legs l where l.booking_id = b.id) as legs
  where b.status = 'paid' and not b.needs_review and b.paid_at < now() - interval '10 minutes'
    and not exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
  union all
  select 'ticket_without_payment', 'critical'::public.alert_severity, t.booking_id, null::uuid,
         jsonb_build_object('ticket_id', t.id),
         jsonb_build_object('ticket_id', t.id, 'booking_status', b.status)
  from public.tickets_qr t
  join public.bookings b on b.id = t.booking_id
  where t.status = 'issued' and b.status not in ('paid', 'checked_in')
  union all
  -- The counts move with every booking: an open issue is about the session and its capacity, while a closing as
  -- ignored covers only the counts it was closed on (reconciliation_issue_said).
  select 'capacity_exceeded', 'high'::public.alert_severity, null::uuid, null::uuid,
         jsonb_build_object('session_id', s.id, 'capacity', s.capacity),
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
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, facts jsonb,
                 details jsonb)
  language sql immutable
  set search_path = ''
as $$
  select 'chain_broken', 'critical'::public.alert_severity, null::uuid, null::uuid, c.said, c.said
  from (values ('audit_logs', p_audit), ('revenue_share_entries', p_ledger)) as v(chain, verdict)
  cross join lateral (select jsonb_strip_nulls(jsonb_build_object('chain', v.chain,
                                                                  'first_broken_id', v.verdict -> 'first_broken_id'))
                        as said) as c
  where not coalesce((v.verdict ->> 'ok')::boolean, false);
$$;
revoke execute on function internal.chain_findings(jsonb, jsonb) from public, anon, authenticated, service_role;


-- ===== Writing the run =====

-- An issue with the same subject that says the same: an open one holding the finding's facts, or one closed as
-- ignored in the last 30 days holding its whole details, the counts it was closed on included (delta review of
-- PR #105, L-1), so a closing hides only what it saw, and only for a while. Any issue counts, a statement issue
-- holding the same Midtrans status and amount included.
create function internal.reconciliation_issue_said(p_issue_type text, p_booking_id uuid, p_payment_id uuid,
  p_facts jsonb, p_details jsonb) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.reconciliation_issues o
                 where o.issue_type = p_issue_type
                   and o.booking_id is not distinct from p_booking_id
                   and o.payment_id is not distinct from p_payment_id
                   and ((o.resolved_at is null and o.details @> p_facts)
                        or (o.resolution = 'ignored' and o.resolved_at > now() - interval '30 days'
                            and o.details @> p_details)));
$$;
revoke execute on function internal.reconciliation_issue_said(text, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- Findings as the finding functions return them, gathered as jsonb before the audit turn is taken.
create function internal.findings_of(p_rows jsonb)
  returns table (issue_type text, severity public.alert_severity, booking_id uuid, payment_id uuid, facts jsonb,
                 details jsonb)
  language sql immutable
  set search_path = ''
as $$
  select f.issue_type, f.severity, f.booking_id, f.payment_id, f.facts, f.details
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as f(issue_type text, severity public.alert_severity,
    booking_id uuid, payment_id uuid, facts jsonb, details jsonb);
$$;
revoke execute on function internal.findings_of(jsonb) from public, anon, authenticated, service_role;

-- One digest alert per Jakarta day with new issues, at least high so the alert sender mails it. A later run of the day
-- that finds something worse raises the open digest to it and has it mailed again; raise_anomaly itself is unchanged.
create function internal.raise_reconciliation_digest(p_run_id uuid, p_written integer,
  p_worst public.alert_severity, p_by_type jsonb) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  digest_severity public.alert_severity := greatest('high'::public.alert_severity, p_worst);
  digest_day text := public.today_jkt()::text;
begin
  perform internal.raise_anomaly('reconciliation_digest', digest_severity, digest_day,
    'Rekonsiliasi pembayaran menemukan selisih baru',
    jsonb_build_object('run_id', p_run_id, 'new_issues', p_written, 'by_type', p_by_type,
                       'open_issues', (select count(*) from public.reconciliation_issues i where i.resolved_at is null)));
  update public.security_alerts a
  set severity = digest_severity, notified_at = null, delivery_claimed_at = null
  where a.fingerprint = 'reconciliation_digest:' || digest_day and a.acknowledged_at is null
    and a.severity < digest_severity;
end;
$$;
revoke execute on function internal.raise_reconciliation_digest(uuid, integer, public.alert_severity, jsonb)
  from public, anon, authenticated, service_role;

-- A step's issues, none an earlier one already says, and the day's digest when it wrote any: how many were found, how
-- many written, and the written ones by type. The caller holds the audit turn.
create function internal.write_reconciliation_findings(p_run_id uuid, p_findings jsonb,
  out raised integer, out written integer, out by_type jsonb)
  language plpgsql
  set search_path = ''
as $$
declare
  worst public.alert_severity;
begin
  with findings as (
    select * from internal.findings_of(p_findings)
  ), new_issues as (
    insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
    select p_run_id, f.booking_id, f.payment_id, f.issue_type, f.severity, f.details
    from findings f
    where not internal.reconciliation_issue_said(f.issue_type, f.booking_id, f.payment_id, f.facts, f.details)
    returning reconciliation_issues.issue_type, reconciliation_issues.severity
  )
  select (select count(*) from findings)::integer, (select count(*) from new_issues)::integer,
         (select max(n.severity) from new_issues n),
         coalesce((select jsonb_object_agg(t.issue_type, t.issues)
                   from (select n.issue_type, count(*) as issues from new_issues n group by n.issue_type) as t),
                  '{}'::jsonb)
  into raised, written, worst, by_type;
  if written > 0 then
    perform internal.raise_reconciliation_digest(p_run_id, written, worst, by_type);
  end if;
end;
$$;
revoke execute on function internal.write_reconciliation_findings(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- The orders of p_reason's window, older than the run, that this run did not compare: window B's wait their turn
-- (delta review of PR #105, L-3), window A's were left unasked by the time budget.
create function internal.orders_not_reconciled(p_looks jsonb, p_reason text) returns integer
  language sql stable
  set search_path = ''
as $$
  select count(*)::integer from internal.reconciliation_window(interval '5 minutes') as w
  where w.reason = p_reason
    and not exists (select 1 from internal.compared_looks(p_looks) as c
                    join public.payments p on p.id = c.payment_id
                    where p.order_id = w.order_id);
$$;
revoke execute on function internal.orders_not_reconciled(jsonb, text) from public, anon, authenticated, service_role;

-- Window B's turn moves for the settled payments this run compared, and only those (L-2).
create function internal.take_reconciliation_turns(p_looks jsonb) returns void
  language sql
  set search_path = ''
as $$
  insert into public.reconciliation_turns (payment_id, last_reconciled_at)
  select p.id, now() from internal.compared_looks(p_looks) as c
  join public.payments p on p.id = c.payment_id
  where p.status in ('settled', 'partially_refunded')
  on conflict (payment_id) do update set last_reconciled_at = excluded.last_reconciled_at;
$$;
revoke execute on function internal.take_reconciliation_turns(jsonb) from public, anon, authenticated, service_role;

-- {run_id, payments_checked, orders_unanswered, orders_waiting, issues_found, issues_already_open}. The chains are the
-- run's next step (reconcile_chains). The scans run before the audit turn is taken.
create function internal.reconcile_payments(p_looks jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  findings jsonb;
  counted record;
  new_run_id uuid;
  checked integer;
  unanswered integer;
  waiting integer;
  open_not_asked integer;
begin
  perform internal.require_server_caller('reconcile_payments');
  perform internal.check_reconciliation_looks(p_looks);
  select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into findings
  from (select * from internal.reconcile_look_findings(p_looks)
        union all
        select * from internal.reconcile_invariant_findings()) as f;
  checked := (select count(*) from internal.compared_looks(p_looks))::integer;
  unanswered := (select count(*) from jsonb_array_elements(p_looks) as l where l ->> 'outcome' = 'unanswered')::integer;
  waiting := internal.orders_not_reconciled(p_looks, 'paid');
  open_not_asked := internal.orders_not_reconciled(p_looks, 'open');

  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.actor_role', 'cron'));
  insert into public.reconciliation_runs (run_date, source, payments_checked)
  values (public.today_jkt(), 'nightly', checked)
  returning id into new_run_id;
  select w.raised, w.written, w.by_type into counted
  from internal.write_reconciliation_findings(new_run_id, findings) as w;
  perform internal.take_reconciliation_turns(p_looks);
  update public.reconciliation_runs
  set issues_found = counted.written, finished_at = now(),
      summary = jsonb_build_object(
        'not_found', (select count(*) from jsonb_array_elements(p_looks) as l where l ->> 'outcome' = 'not_found'),
        'unanswered', unanswered, 'orders_waiting', waiting, 'open_orders_not_asked', open_not_asked,
        'issues_already_open', counted.raised - counted.written, 'by_type', counted.by_type)
  where id = new_run_id;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('run_id', new_run_id, 'payments_checked', checked, 'orders_unanswered', unanswered,
                            'orders_waiting', waiting, 'issues_found', counted.written,
                            'issues_already_open', counted.raised - counted.written);
end;
$$;
revoke execute on function internal.reconcile_payments(jsonb) from public, anon, authenticated, service_role;

-- The run's second step: both chains walked outside the audit turn, their verdicts kept on the run, a broken one an
-- issue beside the critical alert check_chains raises. {ledger_chain_ok, audit_chain_ok, issues_found,
-- issues_already_open}. Only a nightly run whose chains were not walked yet.
create function internal.reconcile_chains(p_run_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  chains record;
  counted record;
begin
  perform internal.require_server_caller('reconcile_chains');
  if not exists (select 1 from public.reconciliation_runs r
                 where r.id = p_run_id and r.source = 'nightly' and r.audit_chain_ok is null
                   and r.ledger_chain_ok is null) then
    raise exception 'the chains are walked once for a nightly run' using errcode = '22023';
  end if;
  select c.audit, c.ledger into chains from internal.check_chains() as c;

  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.actor_role', 'cron'));
  select w.raised, w.written into counted
  from internal.write_reconciliation_findings(p_run_id,
    (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from internal.chain_findings(chains.audit, chains.ledger) f))
    as w;
  update public.reconciliation_runs r
  set ledger_chain_ok = (chains.ledger ->> 'ok')::boolean, audit_chain_ok = (chains.audit ->> 'ok')::boolean,
      issues_found = r.issues_found + counted.written, finished_at = now(),
      summary = r.summary || jsonb_build_object('audit_rows_checked', chains.audit -> 'checked',
                                                'ledger_rows_checked', chains.ledger -> 'checked')
  where r.id = p_run_id;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('ledger_chain_ok', (chains.ledger ->> 'ok')::boolean,
                            'audit_chain_ok', (chains.audit ->> 'ok')::boolean,
                            'issues_found', counted.written, 'issues_already_open', counted.raised - counted.written);
end;
$$;
revoke execute on function internal.reconcile_chains(uuid) from public, anon, authenticated, service_role;


-- ===== The route's entry points =====

create function public.svc_payments_to_reconcile(p_limit integer) returns table (order_id text, reason text)
  language sql security definer
  set search_path = ''
as $$ select * from internal.payments_to_reconcile(p_limit); $$;

create function public.svc_reconcile_payments(p_looks jsonb) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.reconcile_payments(p_looks); $$;

create function public.svc_reconcile_chains(p_run_id uuid) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.reconcile_chains(p_run_id); $$;

revoke execute on function public.svc_payments_to_reconcile(integer), public.svc_reconcile_payments(jsonb),
  public.svc_reconcile_chains(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_payments_to_reconcile(integer), public.svc_reconcile_payments(jsonb),
  public.svc_reconcile_chains(uuid)
  to service_role;
