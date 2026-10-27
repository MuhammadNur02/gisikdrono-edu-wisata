-- Task P4.7.05 (20261104190600; docs/Security.md REC-02): the Midtrans dashboard statement compared with the payments by
-- order_id, as a csv_import reconciliation run: an unknown order, an amount and a status that differ each become an
-- issue; a row that agrees, a capture included, raises nothing. Only the superadmin with a fresh code imports.
begin;
select plan(14);
\ir helpers/rls_personas.psql

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
   'GSK-SC0000A4-01', 40000, null);
select set_config('app.in_rpc', '', true);

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

-- ===== The comparison =====
create temporary table imported on commit drop as
  select public.import_midtrans_statement('midtrans-oktober.csv', '[
    {"order_id": "GSK-SC0000A1-01", "status": "capture", "gross_amount": "100000"},
    {"order_id": "GSK-SC0000A2-01", "status": "settlement", "gross_amount": "50000"},
    {"order_id": "GSK-SC0000A3-01", "status": "settlement", "gross_amount": "75000"},
    {"order_id": "GSK-SC0000A4-01", "status": "expire", "gross_amount": "40000"},
    {"order_id": "GSK-ZZZZZZZZ-01", "status": "settlement", "gross_amount": "1000"}]') as reply;
select is((select (reply ->> 'rows_checked')::int || ':' || (reply ->> 'issues_found')::int from imported), '5:4',
  'five rows are checked and four of them disagree');
reset role;
select is((select source || ':' || payments_checked || ':' || issues_found || ':' || (finished_at is not null)
           from public.reconciliation_runs where id = (select (reply ->> 'run_id')::uuid from imported)),
  'csv_import:5:4:true', 'as a csv_import run of its own');
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

select * from finish();
rollback;
