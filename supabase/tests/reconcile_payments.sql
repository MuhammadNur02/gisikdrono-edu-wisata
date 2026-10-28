-- Task P3.9.03 (20261105090000; docs/Security.md §3.7; REC-01, REC-05, AUD-03, PAY-14): the nightly reconciliation run.
-- Seeded mismatches each become an issue of a nightly run: a paid order Midtrans does not know, a missing invoice, a
-- second settlement, a ledger short of what was paid, a paid booking without tickets, a ticket on a cancelled booking,
-- a session holding more visitors than its capacity, Midtrans' status and amount against ours, and a broken audit
-- chain, which is a critical alert too. A booking whose records agree raises nothing; a second run raises nothing an
-- open issue already says; new issues raise one digest alert for the day; only the server runs it, on looks that name
-- the poll events it stored.
begin;
select plan(30);
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1001', 5, 'regular', 'uji-rekonsiliasi', 'Paket Uji Rekonsiliasi', 'per_pax',
   30000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e2001', 5, public.today_jkt() + 5, '09:13', '10:13', 'Uji rekonsiliasi', 1000),
  ('00000000-0000-4000-8000-0000000e2002', 5, public.today_jkt() + 5, '11:13', '12:13', 'Uji rekonsiliasi kecil', 10);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.hold(p_phone text) returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000e1001',
    array['00000000-0000-4000-8000-0000000e2001']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Rekonsiliasi', 'pic_name', 'Ani Rekon',
                       'pic_phone', p_phone, 'pic_email', 'rekon-' || right(p_phone, 4) || '@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000e1001', 20, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
$$;

create function pg_temp.attempt(p_booking uuid) returns text
  language plpgsql
as $$
declare
  reply jsonb := internal.create_payment_attempt(p_booking, null, null);
begin
  perform internal.attach_snap_token((reply ->> 'payment_id')::uuid, 'token-' || (reply ->> 'order_id'),
                                     'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (reply ->> 'order_id'));
  return reply ->> 'order_id';
end;
$$;

-- What Midtrans answers about an order, as the webhook or the Status API sends it.
create function pg_temp.answer(p_order text, p_status text, p_amount text) returns jsonb
  language sql
as $$
  select jsonb_build_object('order_id', p_order, 'status_code', '200', 'gross_amount', p_amount,
    'signature_key', repeat('a', 128), 'transaction_status', p_status, 'transaction_id', 'txn-' || p_order,
    'payment_type', 'qris', 'currency', 'IDR', 'fraud_status', 'accept',
    'settlement_time', to_char((now() - interval '10 minutes') at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
$$;

-- An order paid through the webhook: its tickets, invoice and ledger written by the settlement itself.
create function pg_temp.paid_order(p_phone text, p_hash text) returns text
  language plpgsql
as $$
declare
  order_id text := pg_temp.attempt(pg_temp.hold(p_phone));
  settled jsonb := pg_temp.answer(order_id, 'settlement', '600000.00');
begin
  perform internal.apply_payment_event((internal.record_payment_event('webhook', p_hash, settled) ->> 'event_id')::bigint,
                                       'webhook', settled);
  return order_id;
end;
$$;

-- The poll event the route would store for an answer.
create function pg_temp.poll_event(p_order text, p_status text, p_amount text, p_hash text) returns bigint
  language sql
as $$
  select (internal.record_payment_event('poll', p_hash, pg_temp.answer(p_order, p_status, p_amount))
          ->> 'event_id')::bigint;
$$;

create temporary table orders on commit drop as
select pg_temp.paid_order('+6281300002101', repeat('c', 64)) as agreeing,
       pg_temp.attempt(pg_temp.hold('+6281300002102')) as open_attempt,
       pg_temp.paid_order('+6281300002103', repeat('d', 64)) as cancelled_with_ticket;
update public.payments set created_at = now() - interval '10 minutes'
where order_id = (select open_attempt from orders);
create temporary table booking_of on commit drop as
select o.agreeing as order_id, p.booking_id from orders o join public.payments p on p.order_id = o.agreeing
union all
select o.open_attempt, p.booking_id from orders o join public.payments p on p.order_id = o.open_attempt
union all
select o.cancelled_with_ticket, p.booking_id from orders o join public.payments p on p.order_id = o.cancelled_with_ticket;

-- A ticket left on a booking that is no longer paid, written past the guards.
alter table public.bookings disable trigger user;
update public.bookings set status = 'cancelled'
where id = (select b.booking_id from booking_of b join orders o on b.order_id = o.cancelled_with_ticket);
alter table public.bookings enable trigger user;

-- A booking held as paid twice over, with no invoice, ledger or ticket, and a leg its session has no room for.
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, institution_name, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  amount_paid, consent_version, consented_at, paid_at)
values ('00000000-0000-4000-8000-0000000e3001', 'GSK-RC0000C1', 'paid', '00000000-0000-4000-8000-0000000e1001', '{}',
        '{5}', 'school', 'Bu Rekon', '+6281300002104', 'rekon-c@contoh.test', 'SD Rekon', 12, public.today_jkt() + 5,
        public.today_jkt() + 5, 50000, 50000, 50000, 'v1', now(), now() - interval '1 hour');
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount,
  settlement_time) values
  ('00000000-0000-4000-8000-0000000e4001', '00000000-0000-4000-8000-0000000e3001', 1, 'midtrans', 'qris', 'settled',
   'GSK-RC0000C1-01', 50000, now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000e4002', '00000000-0000-4000-8000-0000000e3001', 2, 'midtrans', 'qris', 'settled',
   'GSK-RC0000C1-02', 50000, now() - interval '1 hour');
select set_config('app.in_rpc', '', true);
alter table public.booking_legs disable trigger user;
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
values ('00000000-0000-4000-8000-0000000e3001', 5, '00000000-0000-4000-8000-0000000e2002', 1, 12, 'reserved', now());
alter table public.booking_legs enable trigger user;

create temporary table events on commit drop as
select pg_temp.poll_event((select agreeing from orders), 'settlement', '600000.00', repeat('e', 64)) as agreeing,
       pg_temp.poll_event((select cancelled_with_ticket from orders), 'settlement', '600000.00', repeat('f', 64))
         as cancelled_with_ticket;

-- The looks of a run that saw every order but the second settlement.
create function pg_temp.looks(p_extra jsonb default '[]') returns jsonb
  language sql
as $$
  select jsonb_build_array(
    jsonb_build_object('order_id', (select agreeing from orders), 'outcome', 'answered',
                       'event_id', (select agreeing from events)),
    jsonb_build_object('order_id', (select open_attempt from orders), 'outcome', 'not_found'),
    jsonb_build_object('order_id', 'GSK-RC0000C1-01', 'outcome', 'not_found'),
    jsonb_build_object('order_id', (select cancelled_with_ticket from orders), 'outcome', 'answered',
                       'event_id', (select cancelled_with_ticket from events))) || p_extra;
$$;

create function pg_temp.issues(p_booking uuid, p_run uuid) returns text
  language sql
as $$
  select coalesce(string_agg(i.issue_type, ',' order by i.issue_type), '') from public.reconciliation_issues i
  where i.booking_id = p_booking and i.run_id = p_run;
$$;

-- ===== The orders the run asks about =====
select is((select reason from internal.payments_to_reconcile(200) where order_id = (select open_attempt from orders)),
  'open', 'an open attempt of the last 72 h is asked about (window A)');
select is((select reason from internal.payments_to_reconcile(200) where order_id = (select agreeing from orders)),
  'paid', 'and so is a payment settled in the last 7 days (window B)');
select throws_ok($$select * from internal.payments_to_reconcile(0)$$, '22023', null,
  'a listing takes 1 to 200 orders');

-- ===== What a look must be =====
select throws_ok(format($$select internal.reconcile_payments(%L)$$, jsonb_build_array(jsonb_build_object(
    'order_id', (select open_attempt from orders), 'outcome', 'answered', 'event_id', (select agreeing from events)))),
  '22023', null, 'a look naming the event of another order is refused');
select throws_ok(format($$select internal.reconcile_payments(%L)$$, jsonb_build_array(jsonb_build_object(
    'order_id', (select agreeing from orders), 'outcome', 'answered'))),
  '22023', null, 'and so is an answer without the event it was stored as');
select throws_ok(format($$select internal.reconcile_payments(%L)$$, jsonb_build_array(
    jsonb_build_object('order_id', (select open_attempt from orders), 'outcome', 'not_found'),
    jsonb_build_object('order_id', (select open_attempt from orders), 'outcome', 'unanswered'))),
  '22023', null, 'and an order looked at twice');
select throws_ok($$select internal.reconcile_payments('[{"order_id": "GSK-ZZZZZZZZ-01", "outcome": "not_found"}]')$$,
  '22023', null, 'and an order no payment holds');

-- ===== The first run =====
create temporary table first_run on commit drop as select internal.reconcile_payments(pg_temp.looks()) as reply;
select is((select source || ':' || payments_checked || ':' || (finished_at is not null) || ':' || ledger_chain_ok
                  || ':' || audit_chain_ok
           from public.reconciliation_runs where id = (select (reply ->> 'run_id')::uuid from first_run)),
  'nightly:4:true:true:true', 'the run is a finished nightly run of four orders whose chains hold');
select is((select (reply ->> 'issues_found')::int from first_run),
  (select count(*)::int from public.reconciliation_issues where run_id = (select (reply ->> 'run_id')::uuid from first_run)),
  'it reports the issues it wrote');
select is(pg_temp.issues((select booking_id from booking_of where order_id = (select agreeing from orders)),
                         (select (reply ->> 'run_id')::uuid from first_run)),
  '', 'a paid booking whose answer, invoice, ledger and tickets agree raises nothing');
select is(pg_temp.issues((select booking_id from booking_of where order_id = (select open_attempt from orders)),
                         (select (reply ->> 'run_id')::uuid from first_run)),
  '', 'nor does an open attempt Midtrans has no transaction for yet');
select is(pg_temp.issues('00000000-0000-4000-8000-0000000e3001', (select (reply ->> 'run_id')::uuid from first_run)),
  'duplicate_settlement,invoice_mismatch,invoice_mismatch,ledger_sum_mismatch,paid_without_tickets,status_disagreement',
  'the broken booking: two settlements, neither invoiced, no ledger, no ticket, and an order Midtrans does not know');
select is((select details ->> 'midtrans_status' || ':' || severity from public.reconciliation_issues
           where payment_id = '00000000-0000-4000-8000-0000000e4001' and issue_type = 'status_disagreement'),
  'not_found:high', 'money held for an order Midtrans has no transaction for is a high disagreement');
select is((select (details ->> 'gap')::bigint from public.reconciliation_issues
           where booking_id = '00000000-0000-4000-8000-0000000e3001' and issue_type = 'ledger_sum_mismatch'),
  -50000::bigint, 'the ledger gap is what was paid and never allocated');
select is((select severity::text from public.reconciliation_issues
           where booking_id = (select booking_id from booking_of where order_id = (select cancelled_with_ticket from orders))
             and issue_type = 'ticket_without_payment'),
  'critical', 'an issued ticket on a cancelled booking is critical');
select is((select (details ->> 'legs_pax')::int || '/' || (details ->> 'capacity')::int
           from public.reconciliation_issues
           where issue_type = 'capacity_exceeded' and details ->> 'session_id' = '00000000-0000-4000-8000-0000000e2002'),
  '12/10', 'a session holding more visitors than its capacity is an issue');
select is((select severity::text from public.security_alerts
           where fingerprint = 'reconciliation_digest:' || public.today_jkt()::text and acknowledged_at is null),
  'critical', 'new issues raise the day''s digest alert at their worst severity, for the alert sender to mail');
select is((select (reply ->> 'orders_not_checked')::int from first_run) > 0, true,
  'the second settlement nobody asked about is counted as not checked');

-- ===== Again =====
create temporary table second_run on commit drop as
  select internal.reconcile_payments(pg_temp.looks(jsonb_build_array(
    jsonb_build_object('order_id', 'GSK-RC0000C1-02', 'outcome', 'not_found')))) as reply;
select is((select (reply ->> 'issues_found')::int from second_run), 1,
  'a second run writes only what is new: the second settlement Midtrans does not know either');
select is((select (reply ->> 'issues_already_open')::int from second_run),
  (select (reply ->> 'issues_found')::int + (reply ->> 'issues_already_open')::int from first_run),
  'and counts every issue of the first run as already open');
select is((select (reply ->> 'orders_not_checked')::int from second_run),
  (select (reply ->> 'orders_not_checked')::int - 1 from first_run),
  'an order the run looked at is no longer counted as not checked');
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'reconciliation_digest:' || public.today_jkt()::text and acknowledged_at is null),
  1, 'the day keeps one digest alert');

-- ===== Midtrans says otherwise, and the audit chain is broken =====
alter table public.audit_logs disable trigger append_only;
update public.audit_logs set metadata = coalesce(metadata, '{}') || '{"tampered": true}'
where id = (select max(id) from public.audit_logs);
alter table public.audit_logs enable trigger append_only;
create temporary table third_run on commit drop as
  select internal.reconcile_payments(jsonb_build_array(
    jsonb_build_object('order_id', (select agreeing from orders), 'outcome', 'answered',
                       'event_id', pg_temp.poll_event((select agreeing from orders), 'refund', '600000.00',
                                                      repeat('9', 64))),
    jsonb_build_object('order_id', (select open_attempt from orders), 'outcome', 'answered',
                       'event_id', pg_temp.poll_event((select open_attempt from orders), 'pending', '1.00',
                                                      repeat('8', 64))))) as reply;
select is((select details ->> 'midtrans_status' || ':' || (details ->> 'our_status') || ':' || severity
           from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from third_run) and issue_type = 'status_disagreement'),
  'refund:settled:high', 'a refund Midtrans reports on a payment we hold as settled is a high disagreement');
select is((select (details ->> 'midtrans_amount')::bigint || ':' || (details ->> 'our_amount')::bigint
           from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from third_run) and issue_type = 'amount_mismatch'),
  '1:600000', 'an amount Midtrans states otherwise is an amount mismatch, with both figures');
select is((select (reply ->> 'audit_chain_ok')::boolean || ':' || (reply ->> 'ledger_chain_ok')::boolean
           from third_run),
  'false:true', 'the run keeps which chain broke');
select is((select details ->> 'chain' || ':' || severity from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from third_run) and issue_type = 'chain_broken'),
  'audit_logs:critical', 'a broken chain is a critical issue');
select is((select severity::text from public.security_alerts
           where fingerprint = 'chain_broken:audit_logs' and acknowledged_at is null),
  'critical', 'and a critical alert, the one the hourly chain check raises');
select is(internal.anomaly_chains(), 1, 'which the hourly check, walking the same chains, still reports');

-- ===== Only the server =====
select ok(not has_function_privilege('anon', 'public.svc_reconcile_payments(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_reconcile_payments(jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.svc_payments_to_reconcile(integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_payments_to_reconcile(integer)', 'execute')
          and has_function_privilege('service_role', 'public.svc_reconcile_payments(jsonb)', 'execute')
          and has_function_privilege('service_role', 'public.svc_payments_to_reconcile(integer)', 'execute'),
  'only the service role reaches the run, through its svc_ wrappers');
select ok(not has_function_privilege('service_role', 'internal.reconcile_payments(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'internal.reconcile_payments(jsonb)', 'execute')
          and not has_function_privilege('service_role', 'internal.payments_to_reconcile(integer)', 'execute')
          and not has_function_privilege('authenticated', 'internal.payments_to_reconcile(integer)', 'execute'),
  'and nobody calls the internal functions directly');

select * from finish();
rollback;
