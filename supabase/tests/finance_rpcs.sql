-- Task P4.7.01 and P4.7.02 (docs/PRD.md §8.7.1, §10.3; docs/Security.md REC-05, REC-07, REC-10, STAFF-02, AUTH-11):
-- the superadmin's payment totals and a booking's amounts at AAL2 only, the recap invariant, a revenue rule's new
-- version closing the one in force the day before with its shares adding up to 100 %, and a payout that stamps its
-- ledger rows once.
begin;
select plan(52);
\ir helpers/rls_personas.psql

-- ===== Fixtures: a paid RW 05 booking with its payment, invoice and ledger =====
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1001', 5, 'regular', 'uji-keuangan', 'Paket Uji Keuangan', 25000, 'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, institution_name, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  amount_paid, consent_version, consented_at, paid_at)
values ('00000000-0000-4000-8000-0000000e2001', 'GSK-FN0000A1', 'paid', '00000000-0000-4000-8000-0000000e1001', '{}',
        '{5}', 'school', 'Bu Rani', '+6281234560901', 'keuangan@example.test', 'SD Uji Keuangan', 4,
        public.today_jkt() + 10, public.today_jkt() + 10, 100000, 100000, 100000, 'v1', now(), now());
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount,
  settlement_time) values
  ('00000000-0000-4000-8000-0000000e3001', '00000000-0000-4000-8000-0000000e2001', 1, 'midtrans', 'qris', 'settled',
   'GSK-FN0000A1-01', 100000, now());
select set_config('app.in_rpc', '', true);
insert into public.invoices (booking_id, invoice_number, amount_due, snapshot, payment_id) values
  ('00000000-0000-4000-8000-0000000e2001', 'INV/GSK/2026/11/0901', 100000, '{}', '00000000-0000-4000-8000-0000000e3001');
insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, rule_version, beneficiary,
  beneficiary_key, rw_id, base_amount, pct, amount) values
  ('00000000-0000-4000-8000-0000000e2001', '00000000-0000-4000-8000-0000000e3001', 'settlement', 'package', '{}',
   'kelurahan', 'kelurahan', null, 100000, 30, 30000),
  ('00000000-0000-4000-8000-0000000e2001', '00000000-0000-4000-8000-0000000e3001', 'settlement', 'package', '{}',
   'rw_treasury', 'rw:5', 5, 100000, 70, 70000);

-- The proofs the server would have put in the documents bucket (review of PR #68, L7).
insert into storage.objects (bucket_id, name) values
  ('documents', 'payouts/00000000-0000-4000-8000-0000000e4001/bukti.pdf'),
  ('documents', 'payouts/00000000-0000-4000-8000-0000000e4002/bukti.pdf');

-- ===== finance_overview and finance_booking: who =====
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.finance_overview(public.today_jkt() - 30, public.today_jkt())$$, '42501', null,
  'an RW admin reads no payment totals');
select throws_ok($$select public.finance_booking('00000000-0000-4000-8000-0000000e2001')$$, '42501', null,
  'nor a booking''s amounts');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.finance_overview(public.today_jkt() - 30, public.today_jkt())$$, '42501', null,
  'nor does a superadmin at AAL1');
reset role;
select pg_temp.act_as('anon');
select throws_ok($$select public.finance_overview(public.today_jkt() - 30, public.today_jkt())$$, '42501', null,
  'nor anon');

-- ===== finance_overview: the superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.finance_overview(public.today_jkt() - 400, public.today_jkt())$$, '22023', null,
  'a period is at most 12 months');
select cmp_ok((public.finance_overview(public.today_jkt(), public.today_jkt()) #>> '{totals,gross_settled}')::bigint,
  '>=', 100000::bigint, 'the day''s settled payments are counted from v_finance_daily');
select cmp_ok((public.finance_overview(public.today_jkt(), public.today_jkt()) #>> '{totals,qris_count}')::bigint,
  '>=', 1::bigint, 'by method');
select is((public.finance_overview(public.today_jkt(), public.today_jkt()) -> 'daily' -> -1 ->> 'day'),
  public.today_jkt()::text, 'per Jakarta day');
create temporary table invariant_before on commit drop as
  select (public.finance_overview(public.today_jkt(), public.today_jkt()) -> 'invariant') as value;
select ok((select (value ->> 'bookings')::int >= 1 from invariant_before),
  'the invariant covers the bookings paid in the period');

-- ===== finance_booking =====
select is(public.finance_booking('00000000-0000-4000-8000-0000000e2001') #>> '{booking,booking_code}', 'GSK-FN0000A1',
  'a booking''s finances name it by its code');
select is((public.finance_booking('00000000-0000-4000-8000-0000000e2001') #>> '{payments,0,gross_amount}')::bigint,
  100000::bigint, 'with its payment''s amount');
select is((public.finance_booking('00000000-0000-4000-8000-0000000e2001') #>> '{invoices,0,amount_due}')::bigint,
  100000::bigint, 'its invoice''s');
select is(jsonb_array_length(public.finance_booking('00000000-0000-4000-8000-0000000e2001') -> 'ledger'), 2,
  'and its ledger rows');
select is(public.finance_booking('00000000-0000-4000-8000-0000000e2001') #>> '{booking,pic_phone}', null,
  'and never a contact detail');
select is(public.finance_booking('00000000-0000-4000-8000-00000000ffff'), null, 'an unknown booking is null');

-- ===== save_revenue_rule =====
select throws_ok($$select public.save_revenue_rule('package', 'Uji', public.today_jkt(), '[{"beneficiary": "kelurahan", "pct": 30}, {"beneficiary": "rw_treasury", "rw_id": 5,
  "pct": 60}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, 'P0001', null, 'shares that do not add up to 100 are refused');
select throws_ok($$select public.save_revenue_rule('package', 'Uji', public.today_jkt(), '[{"beneficiary": "kelurahan", "pct": 33.333}, {"beneficiary": "rw_treasury", "rw_id": 5,
  "pct": 66.667}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, 'P0001', null, 'and so are shares with three decimals');
select throws_ok($$select public.save_revenue_rule('package', 'Uji', public.today_jkt() - 1, '[{"beneficiary": "kelurahan", "pct": 100}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, 'P0001', null,
  'a version never starts in the past');
select throws_ok($$select public.save_revenue_rule('package', 'Uji', public.today_jkt(), '[{"beneficiary": "umkm_vendor", "vendor_id": "bukan-uuid", "pct": 100}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, 'P0001',
  'a line names a share, a beneficiary, an RW and a vendor it can be read as',
  'a vendor that is no uuid reads as an invalid line (L7)');
select throws_ok($$select public.save_revenue_rule('package', 'Uji', public.today_jkt(), '[{"beneficiary": "lurah", "pct": 100}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, 'P0001',
  'a line names a share, a beneficiary, an RW and a vendor it can be read as', 'and so does an unknown beneficiary');
select throws_ok($$select public.save_revenue_rule('package', 'Uji', public.today_jkt(), '[{"beneficiary": "kelurahan", "pct": 100}]', null, null, null)$$, 'P0001', 'a package rule names its own target, and that target exists',
  'a package rule without its package is refused readably');
create temporary table first_version on commit drop as
  select (public.save_revenue_rule('package', 'Uji keuangan v1', public.today_jkt(), '[{"beneficiary": "kelurahan", "pct": 30}, {"beneficiary": "rw_treasury", "rw_id": 5,
    "pct": 70}]', null, '00000000-0000-4000-8000-0000000e1001', null) ->> 'rule_id')::uuid as id;
reset role;
select is((select string_agg(beneficiary::text || ':' || pct, ',' order by beneficiary)
           from public.revenue_share_rule_lines where rule_id = (select id from first_version)),
  'kelurahan:30.00,rw_treasury:70.00', 'a package''s first version starts today with its lines');
grant select on first_version to authenticated;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.save_revenue_rule('package', 'Uji v2', public.today_jkt(), '[{"beneficiary": "kelurahan", "pct": 100}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, 'P0001', null,
  'a second version starting the same day is refused');
create temporary table second_version on commit drop as
  select public.save_revenue_rule('package', 'Uji keuangan v2', public.today_jkt() + 7, '[{"beneficiary": "kelurahan", "pct": 20}, {"beneficiary": "rw_treasury", "rw_id": 5,
    "pct": 80}]', null, '00000000-0000-4000-8000-0000000e1001', null) as reply;
reset role;
select is((select effective_to from public.revenue_share_rules where id = (select id from first_version)),
  public.today_jkt() + 6, 'a new version closes the one in force on the day before it starts');
select is((select (reply ->> 'closed_rule_id')::uuid from second_version), (select id from first_version),
  'and says which one it closed');
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.save_revenue_rule('package', 'Uji v3', public.today_jkt() + 30, '[{"beneficiary": "kelurahan", "pct": 100}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, '42501', null,
  'a rule is written only with a fresh authenticator code');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.save_revenue_rule('package', 'Uji v3', public.today_jkt() + 30, '[{"beneficiary": "kelurahan", "pct": 100}]', null, '00000000-0000-4000-8000-0000000e1001', null)$$, '42501', null,
  'and never by an RW admin');

-- ===== payout_preview and settle_revenue_entries (review of PR #80, M-2) =====
-- The hint a statement is refused with, or null when it runs.
create function pg_temp.hint_of(p_sql text) returns text
  language plpgsql
as $fn$
declare
  raised_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$fn$;
grant execute on function pg_temp.hint_of(text) to authenticated;
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.payout_preview('rw:5')$$, '42501', null, 'an RW admin previews no payout');
reset role;
select pg_temp.act_as('superadmin_aal2');
create temporary table party_preview on commit drop as select public.payout_preview('rw:5') as value;
select is((select value ->> 'from' from party_preview), (select value ->> 'oldest_unpaid' from party_preview),
  'a preview without a start begins at the party''s oldest unpaid day');
select is((select value ->> 'to' from party_preview), public.today_jkt()::text, 'and ends today');
select is((public.payout_preview('rw:5', public.today_jkt(), public.today_jkt() + 1) ->> 'total'), null,
  'a period reaching past today has no figure');
create temporary table period_preview on commit drop as
  select public.payout_preview('rw:5', public.today_jkt() - 1, public.today_jkt()) as value;
select cmp_ok((select (value ->> 'total')::bigint from period_preview), '>=', 70000::bigint,
  'the period''s figure counts what RW 05 is owed');
select throws_ok($$select public.settle_revenue_entries('rw:5', public.today_jkt(), public.today_jkt(), 'TRF-RW5',
  'proofs/x.pdf', 70000)$$, '22023', null, 'a payout keeps its proof under documents/payouts/');
select throws_ok($$select public.settle_revenue_entries('rw:5', public.today_jkt(), public.today_jkt(), 'TRF-RW5',
  'payouts/00000000-0000-4000-8000-0000000e4001/.bukti.pdf', 70000)$$, '22023', null,
  'and its file name never starts with a dot (N6)');
select is(pg_temp.hint_of($$select public.settle_revenue_entries('rw:5', public.today_jkt() - 1, public.today_jkt(),
  'TRF-RW5-001', 'payouts/00000000-0000-4000-8000-0000000e4001/bukti.pdf', null)$$), 'PAYOUT_TOTAL_MISMATCH',
  'a payout names the amount transferred');
select is(pg_temp.hint_of($$select public.settle_revenue_entries('rw:5', public.today_jkt() - 1, public.today_jkt(),
  'TRF-RW5-001', 'payouts/00000000-0000-4000-8000-0000000e4001/bukti.pdf',
  (select (value ->> 'total')::bigint + 1 from period_preview))$$), 'PAYOUT_TOTAL_MISMATCH',
  'a payout of another amount than its rows add up to is refused (M-2)');
select is((select count(*)::int from public.payout_batches
           where proof_path = 'payouts/00000000-0000-4000-8000-0000000e4001/bukti.pdf'), 0, 'and writes nothing');
create temporary table payout on commit drop as
  select (batch ->> 'id')::uuid as id, (batch ->> 'total_amount')::bigint as total_amount
  from (select public.settle_revenue_entries('rw:5', public.today_jkt() - 1, public.today_jkt(), 'TRF-RW5-001',
          'payouts/00000000-0000-4000-8000-0000000e4001/bukti.pdf',
          (select (value ->> 'total')::bigint from period_preview)) as batch) as recorded;
select is((select total_amount from payout), (select (value ->> 'total')::bigint from period_preview),
  'the payout of what the preview showed is recorded');
reset role;
select is((select total_amount from payout),
  (select sum(e.amount)::bigint from public.revenue_share_entries e where e.payout_batch_id = (select id from payout)),
  'exactly the sum of the rows it stamped (L1)');
select is((select count(*)::int from public.revenue_share_entries
           where booking_id = '00000000-0000-4000-8000-0000000e2001' and payout_batch_id = (select id from payout)), 1,
  'and stamps the RW''s ledger row with it');
select is((select payout_batch_id from public.revenue_share_entries
           where booking_id = '00000000-0000-4000-8000-0000000e2001' and beneficiary_key = 'kelurahan'), null,
  'leaving the kelurahan''s share unpaid');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.settle_revenue_entries('rw:5', public.today_jkt() - 1, public.today_jkt(),
  'TRF-RW5-002', 'payouts/00000000-0000-4000-8000-0000000e4002/bukti.pdf', 70000)$$, 'P0001', null,
  'a second payout of the same rows finds nothing left');
select throws_ok($$select public.settle_revenue_entries('kelurahan', public.today_jkt() - 1, public.today_jkt(),
  'TRF-KEL-001', 'payouts/00000000-0000-4000-8000-0000000e4009/bukti.pdf', 30000)$$, 'P0001',
  'no document at payouts/00000000-0000-4000-8000-0000000e4009/bukti.pdf',
  'a payout names a proof the documents bucket holds (L7)');
select throws_ok($$select public.settle_revenue_entries('rw:5', public.today_jkt(), public.today_jkt() + 1,
  'TRF-RW5-003', 'payouts/00000000-0000-4000-8000-0000000e4003/bukti.pdf', 70000)$$, '22023', null,
  'and a payout covers no day still to come');
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.settle_revenue_entries('kelurahan', public.today_jkt(), public.today_jkt(), 'TRF-KEL',
  'payouts/00000000-0000-4000-8000-0000000e4004/bukti.pdf', 30000)$$, '42501', null, 'a payout needs a fresh code');
reset role;

-- ===== A negative kelurahan row (an A24 shortfall) counts in the payout (#90's review) =====
-- The kelurahan's unpaid rows of the period net to Rp -10.000 once the shortfall is written.
insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, rule_version, beneficiary,
  beneficiary_key, rw_id, base_amount, pct, amount)
select '00000000-0000-4000-8000-0000000e2001', '00000000-0000-4000-8000-0000000e3001', 'reversal', 'package', '{}',
       'kelurahan', 'kelurahan', null, 100000, 30,
       -(coalesce((select sum(u.amount) from internal.unpaid_entries('kelurahan', public.today_jkt() - 1,
                                                                     public.today_jkt()) as u), 0) + 10000);
insert into storage.objects (bucket_id, name) values
  ('documents', 'payouts/00000000-0000-4000-8000-0000000e4005/bukti.pdf'),
  ('documents', 'payouts/00000000-0000-4000-8000-0000000e4006/bukti.pdf');
select pg_temp.act_as('superadmin_aal2');
select is((public.payout_preview('kelurahan', public.today_jkt() - 1, public.today_jkt()) ->> 'total')::bigint,
  -10000::bigint, 'the preview nets a negative kelurahan row');
select is(pg_temp.hint_of($$select public.settle_revenue_entries('kelurahan', public.today_jkt() - 1, public.today_jkt(),
  'TRF-KEL-NEG', 'payouts/00000000-0000-4000-8000-0000000e4005/bukti.pdf', 30000)$$), 'PAYOUT_EMPTY',
  'and a net below nothing is no payout, whatever amount is named');
reset role;
-- Another Rp 25.000 for the kelurahan: the period now nets Rp 15.000.
insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, rule_version, beneficiary,
  beneficiary_key, rw_id, base_amount, pct, amount)
values ('00000000-0000-4000-8000-0000000e2001', '00000000-0000-4000-8000-0000000e3001', 'settlement',
        'addon:00000000-0000-4000-8000-0000000e9001', '{}', 'kelurahan', 'kelurahan', null, 100000, 25, 25000);
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.settle_revenue_entries('kelurahan', public.today_jkt() - 1, public.today_jkt(),
  'TRF-KEL-POS', 'payouts/00000000-0000-4000-8000-0000000e4005/bukti.pdf', 25000)$$), 'PAYOUT_TOTAL_MISMATCH',
  'a payout that leaves the negative row out is refused');
create temporary table kelurahan_payout on commit drop as
  select (public.settle_revenue_entries('kelurahan', public.today_jkt() - 1, public.today_jkt(), 'TRF-KEL-NET',
          'payouts/00000000-0000-4000-8000-0000000e4006/bukti.pdf', 15000) ->> 'id')::uuid as id;
reset role;
select is((select total_amount from public.payout_batches where id = (select id from kelurahan_payout)), 15000::bigint,
  'the payout of the net is recorded');
select is((select count(*)::int from public.revenue_share_entries
           where payout_batch_id = (select id from kelurahan_payout) and amount < 0), 1,
  'and stamps the negative row with it');

-- ===== Review of PR #80, L-5: no payout leaves an unpaid negative row behind (20261104191000) =====
-- A Rp -5.000 kelurahan row of three days ago, still unpaid, and Rp 20.000 of today.
insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, rule_version, beneficiary,
  beneficiary_key, rw_id, base_amount, pct, amount, created_at)
values ('00000000-0000-4000-8000-0000000e2001', '00000000-0000-4000-8000-0000000e3001', 'reversal', 'package', '{}',
        'kelurahan', 'kelurahan', null, 100000, 5, -5000, now() - interval '3 days');
insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, rule_version, beneficiary,
  beneficiary_key, rw_id, base_amount, pct, amount)
values ('00000000-0000-4000-8000-0000000e2001', '00000000-0000-4000-8000-0000000e3001', 'settlement',
        'addon:00000000-0000-4000-8000-0000000e9002', '{}', 'kelurahan', 'kelurahan', null, 100000, 20, 20000);
insert into storage.objects (bucket_id, name) values ('documents', 'payouts/00000000-0000-4000-8000-0000000e4007/bukti.pdf');
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.settle_revenue_entries('kelurahan', public.today_jkt(), public.today_jkt(),
  'TRF-KEL-LATE', 'payouts/00000000-0000-4000-8000-0000000e4007/bukti.pdf', 20000)$$), 'PAYOUT_NEGATIVE_PENDING',
  'a period that starts after an unpaid negative row is refused');
select is((public.settle_revenue_entries('kelurahan', public.today_jkt() - 3, public.today_jkt(), 'TRF-KEL-ALL',
          'payouts/00000000-0000-4000-8000-0000000e4007/bukti.pdf', 15000) ->> 'total_amount')::bigint, 15000::bigint,
  'one that starts at it nets it');
reset role;

select * from finish();
rollback;
