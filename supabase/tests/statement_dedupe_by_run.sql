-- Deferred Lows of the review of PR #99 (20261105120000; docs/Security.md REC-02): a statement row is held back only
-- by an open issue of a statement or nightly run, read from the run's source, that names the same Midtrans status and
-- amount, the same status of ours and is at least as severe. L-1: a late settlement on our side makes an overlapping
-- statement's old "pending" a new, high issue instead of being swallowed. L-2: an identical issue of a manual run
-- hides nothing, whatever keys its details carry, while an identical nightly one still does (decision of
-- 2026-10-29); a lower-severity one does not.
begin;
select plan(13);
\ir helpers/rls_personas.psql

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d5001', 5, 'regular', 'uji-dedupe-run', 'Paket Uji Dedupe Run', 25000, 'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, institution_name, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  amount_paid, consent_version, consented_at, paid_at, expires_at)
select id::uuid, code, status::public.booking_status, '00000000-0000-4000-8000-0000000d5001', '{}', '{5}', 'school',
       'Bu Uji', phone, 'dedupe@contoh.test', 'SD Dedupe', 4, public.today_jkt() + 10, public.today_jkt() + 10,
       amount, amount, case when status = 'paid' then amount else 0 end, 'v1', now(),
       case when status = 'paid' then now() end, case when status = 'pending_payment' then now() + interval '1 day' end
from (values
  ('00000000-0000-4000-8000-0000000d6001', 'GSK-DR0000A1', 'pending_payment', '+6281300005001', 50000),
  ('00000000-0000-4000-8000-0000000d6002', 'GSK-DR0000A2', 'paid', '+6281300005002', 70000),
  ('00000000-0000-4000-8000-0000000d6003', 'GSK-DR0000A3', 'paid', '+6281300005003', 70000),
  ('00000000-0000-4000-8000-0000000d6004', 'GSK-DR0000A4', 'paid', '+6281300005004', 70000))
  as fixture(id, code, status, phone, amount);
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount,
  settlement_time) values
  ('00000000-0000-4000-8000-0000000d7001', '00000000-0000-4000-8000-0000000d6001', 1, 'midtrans', 'qris', 'expired',
   'GSK-DR0000A1-01', 50000, null),
  ('00000000-0000-4000-8000-0000000d7002', '00000000-0000-4000-8000-0000000d6002', 1, 'midtrans', 'qris', 'settled',
   'GSK-DR0000A2-01', 70000, now()),
  ('00000000-0000-4000-8000-0000000d7003', '00000000-0000-4000-8000-0000000d6003', 1, 'midtrans', 'qris', 'settled',
   'GSK-DR0000A3-01', 70000, now()),
  ('00000000-0000-4000-8000-0000000d7004', '00000000-0000-4000-8000-0000000d6004', 1, 'midtrans', 'qris', 'settled',
   'GSK-DR0000A4-01', 70000, now());
select set_config('app.in_rpc', '', true);

-- ===== L-1: our side rises while Midtrans' figures stay =====
select pg_temp.act_as('superadmin_aal2');
select is((public.import_midtrans_statement('lama-1.csv',
  '[{"order_id": "GSK-DR0000A1-01", "status": "pending", "gross_amount": "50000"}]') ->> 'issues_found')::int, 1,
  'an old export saying pending against our expired payment opens an issue');
reset role;
select is((select string_agg(severity::text || ':' || (details ->> 'our_status'), ',') from public.reconciliation_issues
           where payment_id = '00000000-0000-4000-8000-0000000d7001' and resolved_at is null), 'medium:expired',
  'a medium one, naming our expired status');

-- A late settlement makes ours settled.
select set_config('app.in_rpc', '1', true);
update public.payments set status = 'settled', settlement_time = now() where id = '00000000-0000-4000-8000-0000000d7001';
select set_config('app.in_rpc', '', true);

select pg_temp.act_as('superadmin_aal2');
select is((public.import_midtrans_statement('lama-2.csv',
  '[{"order_id": "GSK-DR0000A1-01", "status": "pending", "gross_amount": "50000"},
    {"order_id": "GSK-DR0000Z1-01", "status": "settlement", "gross_amount": "10000"}]') ->> 'issues_found')::int, 2,
  'an overlapping export still saying pending is no longer swallowed');
reset role;
select is((select string_agg(severity::text || ':' || (details ->> 'our_status'), ',' order by created_at, severity)
           from public.reconciliation_issues
           where payment_id = '00000000-0000-4000-8000-0000000d7001' and resolved_at is null),
  'medium:expired,high:settled', 'it is a new, high issue naming our settled status');

select pg_temp.act_as('superadmin_aal2');
create temporary table third_import on commit drop as
  select public.import_midtrans_statement('lama-3.csv',
    '[{"order_id": "GSK-DR0000A1-01", "status": "pending", "gross_amount": "50000"},
      {"order_id": "GSK-DR0000Z2-01", "status": "settlement", "gross_amount": "10000"}]') as reply;
select is((select (reply ->> 'issues_found')::int || ':' || (reply ->> 'issues_already_open') from third_import), '1:1',
  'the same high finding a third time is held back, the new unknown order is not');
reset role;
select is((select count(*)::int from public.reconciliation_issues
           where payment_id = '00000000-0000-4000-8000-0000000d7001' and resolved_at is null), 2,
  'so the payment keeps its two open issues');

-- ===== L-2: the source is the run's, never a key of the details =====
-- Ours settled, Midtrans says pending: a high status_disagreement, with these facts.
create function pg_temp.facts(p_order text, p_payment uuid) returns jsonb
  language sql
as $$
  select jsonb_build_object('order_id', p_order, 'midtrans_status', 'pending', 'midtrans_amount', 70000,
                            'our_status', 'settled', 'our_amount', 70000, 'our_midtrans_refunded', 0);
$$;
create function pg_temp.open_issue(p_source text, p_order text, p_payment uuid, p_booking uuid,
  p_severity public.alert_severity) returns void
  language sql
as $$
  with run as (
    insert into public.reconciliation_runs (run_date, source, started_at, finished_at, payments_checked, issues_found,
      created_by)
    values (public.today_jkt(), p_source, now(), now(), 1, 1,
            case when p_source <> 'nightly' then '00000000-0000-4000-8000-00000000f001'::uuid end)
    returning id
  )
  insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
  select run.id, p_booking, p_payment, 'status_disagreement', p_severity, pg_temp.facts(p_order, p_payment) from run;
$$;
create function pg_temp.statement_writes(p_order text) returns integer
  language sql
as $$
  with run as (
    insert into public.reconciliation_runs (run_date, source, payments_checked, created_by)
    values (public.today_jkt(), 'csv_import', 1, '00000000-0000-4000-8000-00000000f001')
    returning id
  )
  select i.written from run, internal.insert_statement_issues(run.id,
    jsonb_build_array(jsonb_build_object('order_id', p_order, 'status', 'pending', 'gross_amount', '70000')),
    'uji-sumber.csv') as i;
$$;

select pg_temp.open_issue('manual', 'GSK-DR0000A2-01', '00000000-0000-4000-8000-0000000d7002',
  '00000000-0000-4000-8000-0000000d6002', 'high');
select is(pg_temp.statement_writes('GSK-DR0000A2-01'), 1,
  'an identical open issue of a manual run, midtrans_status and all, holds no statement row back');

select pg_temp.open_issue('nightly', 'GSK-DR0000A3-01', '00000000-0000-4000-8000-0000000d7003',
  '00000000-0000-4000-8000-0000000d6003', 'high');
select is(pg_temp.statement_writes('GSK-DR0000A3-01'), 0,
  'an identical open nightly issue still does (decision of 2026-10-29)');

select pg_temp.open_issue('nightly', 'GSK-DR0000A4-01', '00000000-0000-4000-8000-0000000d7004',
  '00000000-0000-4000-8000-0000000d6004', 'medium');
select is(pg_temp.statement_writes('GSK-DR0000A4-01'), 1, 'but not one less severe than the finding (L-1)');
select is((select max(severity)::text from public.reconciliation_issues
           where payment_id = '00000000-0000-4000-8000-0000000d7004' and resolved_at is null), 'high',
  'which is written at its own, higher severity');

-- A nightly refund-amount finding (reason refund_amount) says something else than a statement's amount_mismatch.
select is(internal.statement_issue_said('amount_mismatch', '00000000-0000-4000-8000-0000000d7003',
  pg_temp.facts('GSK-DR0000A3-01', '00000000-0000-4000-8000-0000000d7003'), 'high'), false,
  'no amount_mismatch is open for that payment, so nothing says it');
with run as (
  insert into public.reconciliation_runs (run_date, source, payments_checked) values (public.today_jkt(), 'nightly', 1)
  returning id
)
insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
select run.id, '00000000-0000-4000-8000-0000000d6003', '00000000-0000-4000-8000-0000000d7003', 'amount_mismatch', 'high',
       pg_temp.facts('GSK-DR0000A3-01', '00000000-0000-4000-8000-0000000d7003') || '{"reason": "refund_amount"}'
from run;
select is(internal.statement_issue_said('amount_mismatch', '00000000-0000-4000-8000-0000000d7003',
  pg_temp.facts('GSK-DR0000A3-01', '00000000-0000-4000-8000-0000000d7003'), 'high'), false,
  'and a nightly refund_amount mismatch with the same figures does not either');
select is(internal.statement_issue_said('status_disagreement', '00000000-0000-4000-8000-0000000d7003',
  pg_temp.facts('GSK-DR0000A3-01', '00000000-0000-4000-8000-0000000d7003'), 'high'), true,
  'while the nightly status_disagreement does');

select * from finish();
rollback;
