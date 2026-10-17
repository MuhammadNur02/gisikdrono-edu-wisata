-- RLS matrix for finance: revenue_share_rules, revenue_share_rule_lines, revenue_share_entries, payout_batches and the
-- recap views (docs/PRD.md §8.5.2, docs/Security.md STAFF-01, STAFF-02, Task P1.4.03, P1.4.05, P1.9.02). Every check
-- runs as an API role.
begin;
select plan(28);
\ir helpers/rls_personas.psql

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax) values
  ('00000000-0000-4000-8000-00000000c501', 5, 'regular', 'p5', 'Paket RW 05', 25000),
  ('00000000-0000-4000-8000-00000000c801', 8, 'regular', 'p8', 'Paket RW 08', 25000);
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-00000000d501', 5, 'v5', 'Vendor RW 05'), ('00000000-0000-4000-8000-00000000d801', 8, 'v8', 'Vendor RW 08');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price) values
  ('00000000-0000-4000-8000-00000000e501', 5, '00000000-0000-4000-8000-00000000d501', 'pr5', 'Kompos', 'compost', 15000),
  ('00000000-0000-4000-8000-00000000e801', 8, '00000000-0000-4000-8000-00000000d801', 'pr8', 'Batik', 'souvenir', 50000);
insert into public.revenue_share_rules (id, scope, rw_id, package_id, product_id, name) values
  ('00000000-0000-4000-8000-0000ad000001', 'package_default', null, null, null, 'Global'),
  ('00000000-0000-4000-8000-0000ad000005', 'package_default', 5, null, null, 'Default RW 05'),
  ('00000000-0000-4000-8000-0000ad000008', 'package_default', 8, null, null, 'Default RW 08'),
  ('00000000-0000-4000-8000-0000ad000051', 'package', null, '00000000-0000-4000-8000-00000000c501', null, 'Paket RW 05'),
  ('00000000-0000-4000-8000-0000ad000081', 'product', null, null, '00000000-0000-4000-8000-00000000e801', 'Produk RW 08');
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000ad000005', 'kelurahan', null, 30), ('00000000-0000-4000-8000-0000ad000005', 'rw_treasury', 5, 70),
  ('00000000-0000-4000-8000-0000ad000008', 'kelurahan', null, 30), ('00000000-0000-4000-8000-0000ad000008', 'rw_treasury', 8, 70);
create function pg_temp.is_fixture_rule(p_id uuid) returns boolean
  language sql immutable
as $$
  select p_id in ('00000000-0000-4000-8000-0000ad000001', '00000000-0000-4000-8000-0000ad000005',
                  '00000000-0000-4000-8000-0000ad000008', '00000000-0000-4000-8000-0000ad000051',
                  '00000000-0000-4000-8000-0000ad000081');
$$;
create function pg_temp.is_fixture_booking(p_id uuid) returns boolean
  language sql immutable
as $$
  select p_id in ('00000000-0000-4000-8000-0000b5000060', '00000000-0000-4000-8000-0000b8000001');
$$;
grant execute on function pg_temp.is_fixture_rule(uuid), pg_temp.is_fixture_booking(uuid) to anon, authenticated;
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at)
select id::uuid, code, 'quoted', package_id::uuid, '{}', rw_ids::smallint[], 'school', 'Budi Santoso', phone,
  lower(code) || '@example.test', 4, public.today_jkt() + day_offset, public.today_jkt() + day_offset, 100000, 100000,
  'v1', now()
from (values
  ('00000000-0000-4000-8000-0000b5000060', 'GSK-F5000060', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005460', -60),
  ('00000000-0000-4000-8000-0000b8000001', 'GSK-F8000001', '00000000-0000-4000-8000-00000000c801', '{8}', '+6281200008401', 0)
) as fixture(id, code, package_id, rw_ids, phone, day_offset);
-- The kelurahan's share of an RW 05 booking deliberately carries rw_id 5: the keys, not rw_id, decide.
insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
  rw_id, vendor_id, base_amount, pct, amount) values
  ('00000000-0000-4000-8000-0000b5000060', 'settlement', 'package', '{}', 'kelurahan', 'kelurahan', 5, null, 100000, 20, 20000),
  ('00000000-0000-4000-8000-0000b5000060', 'settlement', 'package', '{}', 'rw_treasury', 'rw:5', 5, null, 100000, 70, 70000),
  ('00000000-0000-4000-8000-0000b5000060', 'settlement', 'package', '{}', 'umkm_vendor',
   'vendor:00000000-0000-4000-8000-00000000d501', 5, '00000000-0000-4000-8000-00000000d501', 100000, 10, 10000),
  ('00000000-0000-4000-8000-0000b8000001', 'settlement', 'package', '{}', 'rw_treasury', 'rw:8', 8, null, 100000, 80, 80000),
  ('00000000-0000-4000-8000-0000b8000001', 'settlement', 'package', '{}', 'umkm_vendor',
   'vendor:00000000-0000-4000-8000-00000000d801', 8, '00000000-0000-4000-8000-00000000d801', 100000, 20, 20000);
insert into public.payout_batches (beneficiary_key, period_from, period_to, total_amount, reference, created_by)
select key, public.today_jkt() - 30, public.today_jkt(), 1000, 'rls-payout', '00000000-0000-4000-8000-00000000f001'
from unnest(array['rw:5', 'rw:8', 'kelurahan', 'vendor:00000000-0000-4000-8000-00000000d501']) as key;

-- ===== anon =====
select pg_temp.act_as('anon');
select throws_ok($$select id from public.revenue_share_rules$$, '42501', null, 'anon reads no revenue rule');
select throws_ok($$select id from public.revenue_share_entries$$, '42501', null, 'no ledger entry');
select throws_ok($$select id from public.payout_batches$$, '42501', null, 'no payout');
select throws_ok($$select day from public.v_revenue_recap_daily$$, '42501', null, 'and no recap');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.revenue_share_rules where pg_temp.is_fixture_rule(id))
  + (select count(*)::int from public.revenue_share_entries where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.payout_batches where reference = 'rls-payout'),
  0,
  'a user without a role sees no finance row'
);

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is(
  (select string_agg(name, ',' order by name) from public.revenue_share_rules where pg_temp.is_fixture_rule(id)),
  'Default RW 05,Paket RW 05',
  'an RW admin sees the rules of their RW and their own packages and products'
);
select is((select count(*)::int from public.revenue_share_rule_lines where pg_temp.is_fixture_rule(rule_id)), 2,
  'and those rules'' lines');
select is(
  (select string_agg(case when beneficiary_key like 'vendor:%' then 'vendor' else beneficiary_key end, ','
                     order by beneficiary_key)
   from public.revenue_share_entries where pg_temp.is_fixture_booking(booking_id)),
  'rw:5,vendor',
  'the ledger entries of their RW''s treasury and their RW''s vendors'
);
select is(
  (select count(*)::int from public.revenue_share_entries
   where pg_temp.is_fixture_booking(booking_id) and beneficiary_key = 'kelurahan'),
  0,
  'never the kelurahan''s share, even when it carries their rw_id (STAFF-02)'
);
select is(
  (select count(*)::int from public.revenue_share_entries where booking_id = '00000000-0000-4000-8000-0000b5000060'),
  2,
  'in every period: a visit two months old still counts, so RW recaps cover the whole history'
);
-- A recap sums every entry of a key, so it is checked against the entries the same reader sees.
select is(
  (select string_agg(distinct case when beneficiary_key like 'vendor:%' then 'vendor' else beneficiary_key end, ',')
   from public.v_revenue_recap_by_party),
  'rw:5,vendor',
  'the recap by party shows their own keys only'
);
select ok(
  (select accrued from public.v_revenue_recap_by_party where beneficiary_key = 'rw:5')
  = (select sum(amount) from public.revenue_share_entries where beneficiary_key = 'rw:5'),
  'and adds up the entries they see'
);
select is(
  (select string_agg(case when beneficiary_key like 'vendor:%' then 'vendor' else beneficiary_key end, ','
                     order by beneficiary_key)
   from public.payout_batches where reference = 'rls-payout'),
  'rw:5,vendor',
  'and the payouts to their own keys'
);
select is((select count(*)::int from public.v_revenue_recap_by_booking where pg_temp.is_fixture_booking(booking_id)), 0,
  'the per-booking recap is the superadmin''s');
select throws_ok($$select day from public.v_finance_daily$$, '42501', null,
  'and the payment totals reach no API role (review of 0005, M1)');
select throws_ok($$insert into public.revenue_share_rules (scope, rw_id, name, created_by)
  values ('package_default', 5, 'Aturan Sendiri', '00000000-0000-4000-8000-00000000f005')$$, '42501', null,
  'and writes no rule');

-- ===== admin_rw 05 without AAL2 =====
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select is((select count(*)::int from public.revenue_share_entries where pg_temp.is_fixture_booking(booking_id)), 0,
  'without AAL2 an RW admin sees no ledger entry');

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select is(
  (select string_agg(case when beneficiary_key like 'vendor:%' then 'vendor' else beneficiary_key end, ','
                     order by beneficiary_key)
   from public.revenue_share_entries where pg_temp.is_fixture_booking(booking_id)),
  'rw:8,vendor',
  'RW 08''s admin sees RW 08''s keys only'
);

-- ===== superadmin at AAL1 =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is(
  (select count(*)::int from public.revenue_share_rules where pg_temp.is_fixture_rule(id))
  + (select count(*)::int from public.revenue_share_entries where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.payout_batches where reference = 'rls-payout'),
  0,
  'a superadmin without AAL2 sees no finance row'
);

-- ===== superadmin at AAL2 with a TOTP code two hours old (docs/Security.md §5.3) =====
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select is((select count(*)::int from public.revenue_share_rules where pg_temp.is_fixture_rule(id)), 5,
  'a superadmin whose code is two hours old reads every rule');
select throws_ok($$insert into public.revenue_share_rules (scope, rw_id, name, created_by)
  values ('addon_default', 8, 'Tambahan RW 08', '00000000-0000-4000-8000-00000000f001')$$, '42501', null,
  'but writes no rule without a fresh code');
select is(pg_temp.row_count($$update public.revenue_share_rule_lines set pct = 0
  where rule_id = '00000000-0000-4000-8000-0000ad000005' and beneficiary = 'kelurahan'$$), 0,
  'and moves no share between the parties');

-- ===== superadmin at AAL2 =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select count(*)::int from public.revenue_share_entries where pg_temp.is_fixture_booking(booking_id)), 5,
  'the superadmin sees the whole ledger');
select is((select count(*)::int from public.v_revenue_recap_by_booking where pg_temp.is_fixture_booking(booking_id)), 2,
  'and the recap per booking');
select throws_ok($$select day from public.v_finance_daily$$, '42501', null,
  'but reads the payment totals through the finance RPC of P4.7.01, not this view');
select lives_ok($$insert into public.payout_batches (beneficiary_key, period_from, period_to, total_amount, created_by)
  values ('rw:5', public.today_jkt() - 7, public.today_jkt(), 5000, '00000000-0000-4000-8000-00000000f001')$$,
  'records a payout in their own name');
select throws_ok($$insert into public.payout_batches (beneficiary_key, period_from, period_to, total_amount, created_by)
  values ('rw:5', public.today_jkt() - 7, public.today_jkt(), 5000, '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'never in someone else''s');
select lives_ok($$insert into public.revenue_share_rules (scope, rw_id, name, created_by)
  values ('addon_default', 5, 'Tambahan RW 05', '00000000-0000-4000-8000-00000000f001')$$, 'and writes a rule');

select * from finish();
rollback;
