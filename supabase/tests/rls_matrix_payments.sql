-- RLS matrix for payments and documents: payments, payment_events, webhook_rejections, payment_adjustments,
-- reconciliation_runs, reconciliation_issues, quotations, invoices, document_sequences, v_booking_admin
-- (docs/PRD.md §8.5.2, docs/Security.md STAFF-01, STAFF-02, Task P1.4.04, P1.4.05, P1.9.02). Every check runs
-- as an API role.
begin;
select plan(33);
\ir helpers/rls_personas.psql

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-00000000c501', 5, 'regular', 'p5', 'Paket RW 05', 25000, 'published'),
  ('00000000-0000-4000-8000-00000000c801', 8, 'regular', 'p8', 'Paket RW 08', 25000, 'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price)
values ('00000000-0000-4000-8000-00000000c900', 'combo', 'pc', 'Paket Kombinasi', 'flat_group', 1500000);
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-00000000c900', 5, 1), ('00000000-0000-4000-8000-00000000c900', 8, 2);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, phone_verified_at)
select id::uuid, code, 'quoted', package_id::uuid, '{}', rw_ids::smallint[], 'school', 'Budi Santoso', phone,
  lower(code) || '@example.test', 4, public.today_jkt() + day_offset, public.today_jkt() + day_offset, total, total,
  'v1', now(), now()
from (values
  ('00000000-0000-4000-8000-0000b5000001', 'GSK-P5000001', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005101', 0, 100000),
  ('00000000-0000-4000-8000-0000b5000008', 'GSK-P5000008', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005108', -8, 100000),
  ('00000000-0000-4000-8000-0000b8000001', 'GSK-P8000001', '00000000-0000-4000-8000-00000000c801', '{8}', '+6281200008101', 0, 100000),
  ('00000000-0000-4000-8000-0000bc000001', 'GSK-PC000001', '00000000-0000-4000-8000-00000000c900', '{5,8}', '+6281200009101', 0, 1500000)
) as fixture(id, code, package_id, rw_ids, phone, day_offset, total);
create function pg_temp.is_fixture_booking(p_id uuid) returns boolean
  language sql immutable
as $$
  select p_id in ('00000000-0000-4000-8000-0000b5000001', '00000000-0000-4000-8000-0000b5000008',
                  '00000000-0000-4000-8000-0000b8000001', '00000000-0000-4000-8000-0000bc000001');
$$;
grant execute on function pg_temp.is_fixture_booking(uuid) to anon, authenticated;
insert into public.payments (id, booking_id, attempt_no, provider, order_id, gross_amount, snap_token, snap_redirect_url,
  va_number, last_payload) values
  ('00000000-0000-4000-8000-0000aa000501', '00000000-0000-4000-8000-0000b5000001', 1, 'midtrans', 'GSK-P5000001-01', 100000,
   'snap-5', 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-5', '8806000501', '{"order_id": "GSK-P5000001-01"}'),
  ('00000000-0000-4000-8000-0000aa000508', '00000000-0000-4000-8000-0000b5000008', 1, 'midtrans', 'GSK-P5000008-01', 100000,
   'snap-6', null, null, null),
  ('00000000-0000-4000-8000-0000aa000801', '00000000-0000-4000-8000-0000b8000001', 1, 'midtrans', 'GSK-P8000001-01', 100000,
   'snap-8', null, null, null),
  ('00000000-0000-4000-8000-0000aa000901', '00000000-0000-4000-8000-0000bc000001', 1, 'midtrans', 'GSK-PC000001-01', 1500000,
   'snap-9', null, null, null);
insert into public.payment_events (payment_id, order_id, source, event_hash, payload)
values ('00000000-0000-4000-8000-0000aa000501', 'GSK-P5000001-01', 'webhook', 'rls-event-1', '{}');
insert into public.webhook_rejections (provider, reason, order_id) values ('midtrans', 'signature_invalid', 'GSK-P5000001-01');
-- Adjustments are written by their RPCs (20261101130200); the fixture stands in for one.
select set_config('app.in_rpc', '1', true);
insert into public.payment_adjustments (booking_id, type, amount, reason, evidence_path, proposed_by)
values ('00000000-0000-4000-8000-0000b5000001', 'write_off', 1000, 'Selisih pembulatan uji', 'documents/bukti.pdf',
        '00000000-0000-4000-8000-00000000f001');
select set_config('app.in_rpc', '', true);
insert into public.reconciliation_runs (id, run_date, source) values ('00000000-0000-4000-8000-0000ab000001', public.today_jkt(), 'manual');
insert into public.reconciliation_issues (id, run_id, booking_id, issue_type, severity) values
  ('00000000-0000-4000-8000-0000ab000002', '00000000-0000-4000-8000-0000ab000001', '00000000-0000-4000-8000-0000b5000001',
   'amount_mismatch', 'high'),
  ('00000000-0000-4000-8000-0000ab000003', '00000000-0000-4000-8000-0000ab000001', '00000000-0000-4000-8000-0000b5000001',
   'pending_beyond_ttl', 'medium');
insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot) values
  ('00000000-0000-4000-8000-0000b5000001', 'SP/GSK/2026/10/0501', 'RLSQUOTE05', public.today_jkt() + 14, '{}'),
  ('00000000-0000-4000-8000-0000b8000001', 'SP/GSK/2026/10/0801', 'RLSQUOTE08', public.today_jkt() + 14, '{}'),
  ('00000000-0000-4000-8000-0000bc000001', 'SP/GSK/2026/10/0901', 'RLSQUOTE09', public.today_jkt() + 14, '{}');
insert into public.invoices (booking_id, invoice_number, amount_due, snapshot) values
  ('00000000-0000-4000-8000-0000b5000001', 'INV/GSK/2026/10/0501', 100000, '{}'),
  ('00000000-0000-4000-8000-0000b8000001', 'INV/GSK/2026/10/0801', 100000, '{}'),
  ('00000000-0000-4000-8000-0000bc000001', 'INV/GSK/2026/10/0901', 1500000, '{}');

-- ===== anon =====
select pg_temp.act_as('anon');
select throws_ok($$select id from public.payments$$, '42501', null, 'anon reads no payment');
select throws_ok($$select id from public.quotations$$, '42501', null, 'no quotation');
select throws_ok($$select id from public.invoices$$, '42501', null, 'no invoice');
select throws_ok($$select id from public.payment_events$$, '42501', null, 'no payment event');
select throws_ok($$select kind from public.document_sequences$$, '42501', null, 'and no document counter');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.payments where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.quotations where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.invoices where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.payment_events where event_hash = 'rls-event-1'),
  0,
  'a user without a role sees no money and no document'
);

-- ===== admin_rw 05 =====
-- A payment, an invoice and a quotation each carry the whole booking's money, the combo's included, so their
-- amounts and snapshots reach no API role (review of 0005, M1).
reset role;
select pg_temp.act_as('admin_rw_05');
select is(
  (select string_agg(order_id, ',' order by order_id) from public.payments where pg_temp.is_fixture_booking(booking_id)),
  'GSK-P5000001-01,GSK-PC000001-01',
  'an RW admin sees the payments of the bookings they see: their RW and the combo, inside the window'
);
select throws_ok($$select gross_amount from public.payments$$, '42501', null,
  'but no payment''s amount, which for the combo holds RW 08''s share');
select throws_ok($$select refunded_amount from public.payments$$, '42501', null, 'nor the amount refunded');
select throws_ok($$select snap_token from public.payments$$, '42501', null, 'never the snap token');
select throws_ok($$select snap_redirect_url from public.payments$$, '42501', null, 'nor the hosted pay link');
select throws_ok($$select va_number from public.payments$$, '42501', null, 'nor the VA number');
select throws_ok($$select last_payload from public.payments$$, '42501', null, 'nor the stored Midtrans reply');
select throws_ok($$update public.payments set status = 'settled' where order_id = 'GSK-P5000001-01'$$, '42501', null,
  'and writes no payment');
select is(
  (select count(*)::int from public.payment_events where event_hash = 'rls-event-1')
  + (select count(*)::int from public.webhook_rejections where order_id = 'GSK-P5000001-01')
  + (select count(*)::int from public.payment_adjustments where reason = 'Selisih pembulatan uji')
  + (select count(*)::int from public.reconciliation_runs where id = '00000000-0000-4000-8000-0000ab000001')
  + (select count(*)::int from public.reconciliation_issues where id = '00000000-0000-4000-8000-0000ab000002'),
  0,
  'events, rejections, adjustments and reconciliation are the superadmin''s alone'
);
select is(
  (select string_agg(quotation_number, ',' order by quotation_number) from public.quotations
   where pg_temp.is_fixture_booking(booking_id)),
  'SP/GSK/2026/10/0501,SP/GSK/2026/10/0901',
  'quotations follow their booking'
);
select throws_ok($$select snapshot from public.quotations$$, '42501', null, 'without the snapshot, which lists the money');
select is(
  (select string_agg(invoice_number, ',' order by invoice_number) from public.invoices
   where pg_temp.is_fixture_booking(booking_id)),
  'INV/GSK/2026/10/0501,INV/GSK/2026/10/0901',
  'and so do invoices'
);
select throws_ok($$select amount_due, amount_paid from public.invoices$$, '42501', null, 'without their amounts');
select throws_ok($$select snapshot from public.invoices$$, '42501', null, 'or their snapshot');
select is(
  (select jsonb_array_length(payments) || '/' || jsonb_array_length(invoices) from public.v_booking_admin
   where booking_code = 'GSK-P5000001'),
  '1/1',
  'the booking detail view lists the payment and the invoice'
);
select is(
  (select (payments -> 0 ->> 'status') || '/' || (payments -> 0 ? 'gross_amount') || '/' || coalesce(total_amount::text, '-')
   from public.v_booking_admin where booking_code = 'GSK-PC000001'),
  'initiated/false/-',
  'and for the combo shows the payment''s state, with neither its amount nor the booking''s total'
);

-- ===== admin_rw 05 without AAL2 =====
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select is((select count(*)::int from public.payments where pg_temp.is_fixture_booking(booking_id)), 0,
  'without AAL2 an RW admin sees no payment');

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select is(
  (select string_agg(order_id, ',' order by order_id) from public.payments where pg_temp.is_fixture_booking(booking_id)),
  'GSK-P8000001-01,GSK-PC000001-01',
  'RW 08''s admin sees RW 08''s payment and the combo''s'
);
select is(
  (select string_agg(invoice_number, ',' order by invoice_number) from public.invoices
   where pg_temp.is_fixture_booking(booking_id)),
  'INV/GSK/2026/10/0801,INV/GSK/2026/10/0901',
  'and the same invoices'
);

-- ===== superadmin at AAL1 =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is(
  (select count(*)::int from public.payments where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.payment_events where event_hash = 'rls-event-1')
  + (select count(*)::int from public.payment_adjustments where reason = 'Selisih pembulatan uji'),
  0,
  'a superadmin without AAL2 sees no payment, event or adjustment'
);

-- ===== superadmin at AAL2 =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select count(*)::int from public.payments where pg_temp.is_fixture_booking(booking_id)), 4,
  'the superadmin sees every payment, the old one included');
select is(
  (select count(*)::int from public.payment_events where event_hash = 'rls-event-1')
  + (select count(*)::int from public.webhook_rejections where order_id = 'GSK-P5000001-01')
  + (select count(*)::int from public.payment_adjustments where reason = 'Selisih pembulatan uji'),
  3,
  'every event, rejection and adjustment'
);
select throws_ok($$select snap_token, va_number from public.payments$$, '42501', null,
  'but no snap token or VA number through the API');
select throws_ok($$select gross_amount from public.payments$$, '42501', null,
  'nor any amount, which the finance RPC of P4.7.01 serves instead');
select throws_ok($$select payload from public.payment_events$$, '42501', null,
  'nor a payment event''s payload (review of 0005, L1)');
select is(pg_temp.row_count($$update public.reconciliation_issues set resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-00000000f001', resolution = 'resolved', resolution_note = 'Sudah dicek'
  where id = '00000000-0000-4000-8000-0000ab000002'$$), 1, 'resolves a reconciliation issue in their own name');
-- Review of PR #80, L-2: against an issue still open, so the refusal is the policy's and not the closed-once trigger's.
select throws_ok($$update public.reconciliation_issues set resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-00000000f005', resolution = 'resolved', resolution_note = 'Sudah dicek'
  where id = '00000000-0000-4000-8000-0000ab000003'$$, '42501', 'new row violates row-level security policy for table "reconciliation_issues"',
  'never in someone else''s');

select * from finish();
rollback;
