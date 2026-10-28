-- Task P4.7.05 (20261104210200; docs/Security.md REC-02): the Midtrans dashboard statement compared with the payments by
-- order_id, as a csv_import reconciliation run: an unknown order, an amount and a status that differ each become an
-- issue; a row that agrees, a capture included, raises nothing. Only the superadmin with a fresh code imports.
-- Review of PR #99: the same statement again is the run it made (M1), an overlapping one raises no issue already open
-- (M1) unless Midtrans now says something else (delta review, M-A), a status Midtrans' map does not know is refused (L2), five imports an hour (L4), the period on the run and a
-- refunded duplicate raising nothing (Info), and nothing outside the reconciliation tables changes (L1).
begin;
select plan(32);
\ir helpers/rls_personas.psql

create function pg_temp.hint_of(p_sql text) returns text
  language plpgsql
as $$
declare
  raised_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;
grant execute on function pg_temp.hint_of(text) to authenticated;

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d1001', 5, 'regular', 'uji-statement', 'Paket Uji Statement', 25000, 'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, institution_name, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  amount_paid, consent_version, consented_at, paid_at, expires_at)
select id::uuid, code, status::public.booking_status, '00000000-0000-4000-8000-0000000d1001', '{}', '{5}', 'school',
       'Bu Uji', phone, 'statement@contoh.test', 'SD Statement', 4, public.today_jkt() + 10, public.today_jkt() + 10,
       amount, amount, case when status = 'paid' then amount else 0 end, 'v1', now(),
       case when status = 'paid' then now() end, case when status = 'pending_payment' then now() + interval '1 day' end
from (values
  ('00000000-0000-4000-8000-0000000d2001', 'GSK-SC0000A1', 'paid', '+6281300003001', 100000),
  ('00000000-0000-4000-8000-0000000d2002', 'GSK-SC0000A2', 'pending_payment', '+6281300003002', 50000),
  ('00000000-0000-4000-8000-0000000d2003', 'GSK-SC0000A3', 'paid', '+6281300003003', 70000),
  ('00000000-0000-4000-8000-0000000d2004', 'GSK-SC0000A4', 'pending_payment', '+6281300003004', 40000))
  as fixture(id, code, status, phone, amount);
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount,
  settlement_time) values
  ('00000000-0000-4000-8000-0000000d3001', '00000000-0000-4000-8000-0000000d2001', 1, 'midtrans', 'qris', 'settled',
   'GSK-SC0000A1-01', 100000, now()),
  ('00000000-0000-4000-8000-0000000d3002', '00000000-0000-4000-8000-0000000d2002', 1, 'midtrans', 'qris', 'pending',
   'GSK-SC0000A2-01', 50000, null),
  ('00000000-0000-4000-8000-0000000d3003', '00000000-0000-4000-8000-0000000d2003', 1, 'midtrans', 'qris', 'settled',
   'GSK-SC0000A3-01', 70000, now()),
  ('00000000-0000-4000-8000-0000000d3004', '00000000-0000-4000-8000-0000000d2004', 1, 'midtrans', 'qris', 'pending',
   'GSK-SC0000A4-01', 40000, null),
  ('00000000-0000-4000-8000-0000000d3005', '00000000-0000-4000-8000-0000000d2001', 2, 'midtrans', 'qris', 'duplicate',
   'GSK-SC0000A1-02', 100000, now());
select set_config('app.in_rpc', '', true);

-- L1: what the import must leave as it is.
create temporary table money_rows on commit drop as
select (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from public.payments p)
       || (select md5(coalesce(string_agg(b::text, '|' order by b.id), '')) from public.bookings b)
       || (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from public.payment_events e)
       || (select md5(coalesce(string_agg(r::text, '|' order by r.id), '')) from public.revenue_share_entries r)
       as digest;

-- ===== Who imports =====
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.import_midtrans_statement('statement.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"}]')$$, '42501', null,
  'an RW admin imports no statement');
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.import_midtrans_statement('statement.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"}]')$$, '42501', null,
  'nor a superadmin whose code is no longer fresh');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.import_midtrans_statement('statement.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"}]')$$, '42501', null,
  'nor a superadmin without the second factor (L1)');
reset role;
select pg_temp.act_as('anon');
select throws_ok($$select public.import_midtrans_statement('statement.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"}]')$$, '42501', null,
  'nor a visitor');
reset role;
select pg_temp.act_as('none');
select throws_ok($$select public.import_midtrans_statement('statement.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"}]')$$, '42501', null,
  'nor a signed-in account that holds no role');

-- ===== What a statement is =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.import_midtrans_statement('kosong.csv', '[]')$$, 'P0001', null,
  'an empty statement is refused');
select throws_ok($$select public.import_midtrans_statement('ganda.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"},
    {"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"}]')$$, 'P0001', null,
  'and so is one listing an order twice');
select throws_ok($$select public.import_midtrans_statement('pecahan.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000.50"}]')$$, 'P0001', null,
  'and one whose amount is not whole rupiah');
select is(pg_temp.hint_of($$select public.import_midtrans_statement('otorisasi.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "authorize", "gross_amount": "100000"}]')$$), 'STATEMENT_INVALID',
  'and one whose status midtrans_payment_status does not map (L2)');
select is(pg_temp.hint_of($$select public.import_midtrans_statement('periode.csv',
  '[{"order_id": "GSK-SC0000A1-01", "status": "settlement", "gross_amount": "100000"}]', '2026-10-31', '2026-10-01')$$),
  'STATEMENT_INVALID', 'and a period that ends before it starts');

-- Delta review of PR #99, M-A: the key gap a released refund opened for a payment (open_key_gap_issue) is no
-- statement issue, so it hides none.
reset role;
with gap_run as (
  insert into public.reconciliation_runs (run_date, source, started_at, finished_at, payments_checked, issues_found,
    summary, created_by)
  values (public.today_jkt(), 'manual', now(), now(), 1, 1, '{"reason": "refund_key_mismatch_released"}',
          '00000000-0000-4000-8000-00000000f001')
  returning id
)
insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
select gap_run.id, '00000000-0000-4000-8000-0000000d2003', '00000000-0000-4000-8000-0000000d3003', 'amount_mismatch',
       'high', '{"reason": "refund_key_mismatch_released", "booked_amount": 70000, "midtrans_amount": 60000, "gap": 10000}'
from gap_run;
select pg_temp.act_as('superadmin_aal2');

-- ===== The comparison =====
create temporary table imported on commit drop as
  select public.import_midtrans_statement('midtrans-oktober.csv', '[
    {"order_id": "GSK-SC0000A1-01", "status": "capture", "gross_amount": "100000"},
    {"order_id": "GSK-SC0000A2-01", "status": "settlement", "gross_amount": "50000"},
    {"order_id": "GSK-SC0000A3-01", "status": "settlement", "gross_amount": "75000"},
    {"order_id": "GSK-SC0000A4-01", "status": "expire", "gross_amount": "40000"},
    {"order_id": "GSK-ZZZZZZZZ-01", "status": "settlement", "gross_amount": "1000"}]', '2026-10-01', '2026-10-31')
    as reply;
grant select on imported to authenticated;
select is((select (reply ->> 'rows_checked')::int || ':' || (reply ->> 'issues_found')::int from imported), '5:4',
  'five rows are checked and four of them disagree');
reset role;
select is((select source || ':' || payments_checked || ':' || issues_found || ':' || (finished_at is not null)
           from public.reconciliation_runs where id = (select (reply ->> 'run_id')::uuid from imported)),
  'csv_import:5:4:true', 'as a csv_import run of its own');
select is((select (summary ->> 'period_from') || '/' || (summary ->> 'period_to') from public.reconciliation_runs
           where id = (select (reply ->> 'run_id')::uuid from imported)),
  '2026-10-01/2026-10-31', 'which keeps the period of the statement (Info)');
select is((select string_agg(issue_type, ',' order by issue_type) from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from imported)),
  'amount_mismatch,status_disagreement,status_disagreement,unknown_order',
  'an amount, two statuses and an unknown order');
select is((select severity::text || ':' || (details ->> 'midtrans_amount') || ':' || (details ->> 'our_amount')
           from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from imported) and issue_type = 'amount_mismatch'),
  'high:75000:70000', 'the amount issue names both amounts');
select is((select severity::text || ':' || (details ->> 'our_status') from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from imported)
             and payment_id = '00000000-0000-4000-8000-0000000d3002'),
  'high:pending', 'Midtrans settling what the database still holds as pending is a high issue');
select is((select severity::text || ':' || (details ->> 'midtrans_status') from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from imported)
             and payment_id = '00000000-0000-4000-8000-0000000d3004'),
  'medium:expire', 'an expiry Midtrans reports before we hear of it, with no money on either side, is a medium one');
select is((select payment_id from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from imported) and issue_type = 'unknown_order'), null,
  'an unknown order names no payment');
select is((select count(*)::int from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from imported)
             and payment_id = '00000000-0000-4000-8000-0000000d3001'), 0,
  'a capture of the right amount agrees with a settled payment');
select is((select (metadata ->> 'issues')::int from public.audit_logs
           where action = 'reconciliation.csv_import' and entity_id = (select reply ->> 'run_id' from imported)), 4,
  'and the import is in the audit log');
select is((select count(*)::int from public.reconciliation_issues
           where resolved_at is null and issue_type = 'amount_mismatch'
             and payment_id = '00000000-0000-4000-8000-0000000d3003'), 2,
  'the key gap open for that payment hides no amount the statement disagrees on (M-A)');

-- ===== M1: the same statement again is the run it made =====
select pg_temp.act_as('superadmin_aal2');
create temporary table repeated on commit drop as
  select public.import_midtrans_statement('midtrans-oktober (1).csv', '[
    {"order_id": "GSK-ZZZZZZZZ-01", "status": "settlement", "gross_amount": "1000"},
    {"order_id": "GSK-SC0000A4-01", "status": "expire", "gross_amount": "40000"},
    {"order_id": "GSK-SC0000A3-01", "status": "settlement", "gross_amount": "75000"},
    {"order_id": "GSK-SC0000A2-01", "status": "settlement", "gross_amount": "50000"},
    {"order_id": "GSK-SC0000A1-01", "status": "capture", "gross_amount": "100000"}]') as reply;
reset role;
select is((select (reply ->> 'already_imported') || ':' || (reply ->> 'run_id') || ':' || (reply ->> 'issues_found')
           from repeated),
  'true:' || (select reply ->> 'run_id' from imported) || ':4',
  'the same rows in another order and under another name answer with the earlier run');
select is((select count(*)::int from public.reconciliation_runs r
           where r.source = 'csv_import'
             and r.statement_fingerprint = (select e.statement_fingerprint from public.reconciliation_runs e
                                            where e.id = (select (reply ->> 'run_id')::uuid from imported))), 1,
  'so one run holds that statement');
select is((select count(*)::int from public.reconciliation_issues i
           join public.reconciliation_runs r on r.id = i.run_id
           where r.source = 'csv_import' and i.resolved_at is null), 4,
  'and no issue is raised twice');

-- ===== M1: an overlapping statement raises only what is new =====
select pg_temp.act_as('superadmin_aal2');
create temporary table overlapping on commit drop as
  select public.import_midtrans_statement('midtrans-minggu-5.csv', '[
    {"order_id": "GSK-SC0000A3-01", "status": "settlement", "gross_amount": "75000"},
    {"order_id": "GSK-SC0000A4-01", "status": "expire", "gross_amount": "40000"},
    {"order_id": "GSK-SC0000A1-02", "status": "refund", "gross_amount": "100000"},
    {"order_id": "GSK-YYYYYYYY-01", "status": "settlement", "gross_amount": "2000"}]') as reply;
reset role;
select is((select (reply ->> 'issues_found') || ':' || (reply ->> 'issues_already_open') from overlapping), '1:2',
  'an overlapping week raises its new unknown order and leaves the two differences already open');
select is((select count(*)::int from public.reconciliation_issues
           where resolved_at is null and issue_type = 'amount_mismatch' and details ? 'midtrans_status'
             and payment_id = '00000000-0000-4000-8000-0000000d3003'), 1,
  'so one statement amount issue stays open for that payment');
select is((select count(*)::int from public.reconciliation_issues
           where payment_id = '00000000-0000-4000-8000-0000000d3005'), 0,
  'and a duplicate payment Midtrans refunded raises nothing (Info)');

-- ===== M-A: what Midtrans now says otherwise is a new issue =====
select pg_temp.act_as('superadmin_aal2');
create temporary table settled_later on commit drop as
  select public.import_midtrans_statement('midtrans-minggu-6.csv', '[
    {"order_id": "GSK-SC0000A4-01", "status": "settlement", "gross_amount": "40000"}]') as reply;
create temporary table expired_later on commit drop as
  select public.import_midtrans_statement('midtrans-minggu-7.csv', '[
    {"order_id": "GSK-SC0000A2-01", "status": "expire", "gross_amount": "50000"}]') as reply;
reset role;
select is((select (reply ->> 'issues_found') || ':' || (reply ->> 'issues_already_open') from settled_later), '1:0',
  'Midtrans settling an order it reported expired is not hidden behind the open expiry');
select is((select severity::text || ':' || (details ->> 'midtrans_status') from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from settled_later)),
  'high:settlement', 'and is the high issue money taken on that order is');
select is((select severity::text || ':' || (details ->> 'midtrans_status') from public.reconciliation_issues
           where run_id = (select (reply ->> 'run_id')::uuid from expired_later)),
  'high:expire', 'a changed status whose own severity is lower keeps the worst still open for that payment');

-- ===== L1: the import compares; it changes nothing it compares with =====
select is((select (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from public.payments p)
                  || (select md5(coalesce(string_agg(b::text, '|' order by b.id), '')) from public.bookings b)
                  || (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from public.payment_events e)
                  || (select md5(coalesce(string_agg(r::text, '|' order by r.id), '')) from public.revenue_share_entries r)),
  (select digest from money_rows), 'payments, bookings, payment events and the ledger are as they were');

-- ===== L4: five imports an hour =====
insert into public.rate_limit_buckets (key, window_start, count)
values ('statement_import:00000000-0000-4000-8000-00000000f001',
        to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 5)
on conflict (key, window_start) do update set count = 5;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.import_midtrans_statement('keenam.csv',
  '[{"order_id": "GSK-XXXXXXXX-01", "status": "settlement", "gross_amount": "3000"}]')$$), 'RATE_LIMITED',
  'a sixth import within the hour is refused');
reset role;

select * from finish();
rollback;
