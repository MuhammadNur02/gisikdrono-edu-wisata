-- The revenue split a settlement will post (Task P3.9.04; internal.allocate_revenue_share of Task P3.9.01 calls these).
-- Golden cases: integer IDR, largest remainder, parts that always add up to the amount, ties to the kelurahan, then the
-- RW treasuries in the booking's leg order, then vendors; a combo's RW share split equally over its legs; a package rule
-- over the default; and every refusal: no rule, an ambiguous rule, an RW outside the booking.
begin;
select plan(48);

-- ===== internal.largest_remainder_split: the pure arithmetic =====
select is(internal.largest_remainder_split(100000, array[20, 80]::numeric[]), array[20000, 80000]::bigint[],
  'an even amount splits exactly');
select is(internal.largest_remainder_split(80000, array[1, 1, 1]::numeric[]), array[26667, 26667, 26666]::bigint[],
  'three equal parts of 80 000: the two leftover rupiah go to the first two parts');
select is(internal.largest_remainder_split(7, array[20, 80]::numeric[]), array[1, 6]::bigint[],
  '7 at 20/80 is 1.4 and 5.6: the leftover rupiah goes to the larger remainder');
select is(internal.largest_remainder_split(5, array[90, 10]::numeric[]), array[5, 0]::bigint[],
  '5 at 90/10 is 4.5 and 0.5: on a tie the earlier part wins');
select is(internal.largest_remainder_split(1, array[1, 1, 1]::numeric[]), array[1, 0, 0]::bigint[],
  'one rupiah over three parts goes to the first');
select is(internal.largest_remainder_split(2, array[1, 1, 1]::numeric[]), array[1, 1, 0]::bigint[],
  'two rupiah over three parts go to the first two');
select is(internal.largest_remainder_split(0, array[20, 80]::numeric[]), array[0, 0]::bigint[],
  'nothing splits into nothing');
select is(internal.largest_remainder_split(100001, array[33.33, 33.33, 33.34]::numeric[]),
  array[33330, 33330, 33341]::bigint[], 'unequal weights with decimals still add up to the amount');
-- Exact at any size (independent review of PR #24, 3): no rounded division decides a rupiah.
select is(internal.largest_remainder_split(50000000000000001, array[1, 2, 2]::numeric[]),
  array[10000000000000000, 20000000000000001, 20000000000000000]::bigint[],
  'at 5e16 the leftover rupiah still goes to the largest fraction (0.4), not to the 0.2');
select is(internal.largest_remainder_split(9223372036854775807, array[1, 1]::numeric[]),
  array[4611686018427387904, 4611686018427387903]::bigint[], 'the largest bigint splits in two exactly');
select is(internal.largest_remainder_split(9223372036854775807, array[20, 80]::numeric[]),
  array[1844674407370955161, 7378697629483820646]::bigint[], 'and at 20/80');
select is(internal.largest_remainder_split(9223372036854775807, array[1, 1, 1]::numeric[]),
  array[3074457345618258603, 3074457345618258602, 3074457345618258602]::bigint[], 'and in three');
select is(internal.largest_remainder_split(12345678901234567, array[33.33, 33.33, 33.34]::numeric[]),
  array[4114814777781481, 4114814777781481, 4116049345671605]::bigint[], 'and with decimal weights');
select throws_ok($$select internal.largest_remainder_split(-1, array[1]::numeric[])$$, '22023', null,
  'a negative amount is refused');
select throws_ok($$select internal.largest_remainder_split(10, array[]::numeric[])$$, '22023', null,
  'so is a split into no parts');
select throws_ok($$select internal.largest_remainder_split(10, array[0, 0]::numeric[])$$, '22023', null,
  'and weights that add up to nothing');
select throws_ok($$select internal.largest_remainder_split(10, array[1, -1, 2]::numeric[])$$, '22023', null,
  'and a negative weight');

-- ===== internal.revenue_split: a rule over an amount and the booking's legs =====
create function pg_temp.split(p_rule uuid, p_amount bigint, p_rw_ids smallint[]) returns text
  language sql
as $$
  select string_agg(s.beneficiary || coalesce('/' || s.rw_id, '') || '=' || s.amount, ' ' order by s.part_order)
  from internal.revenue_split(p_rule, p_amount, p_rw_ids) s;
$$;
-- The defaults in force today: on a database older than a day, the version they replaced is still active with an end
-- date before today (20261105160000).
create function pg_temp.combo_default() returns uuid
  language sql
as $$
  select r.id from public.revenue_share_rules r
  where r.scope = 'package_default' and r.rw_id is null and r.package_id is null and r.product_id is null and r.is_active
    and r.effective_from <= public.today_jkt() and (r.effective_to is null or r.effective_to >= public.today_jkt());
$$;
create function pg_temp.rw13_default() returns uuid
  language sql
as $$
  select r.id from public.revenue_share_rules r
  where r.scope = 'package_default' and r.rw_id = 13 and r.package_id is null and r.product_id is null and r.is_active
    and r.effective_from <= public.today_jkt() and (r.effective_to is null or r.effective_to >= public.today_jkt());
$$;

-- Decision of 2026-10-29: the combo default pays the RWs of the booking 100 % in equal parts, the kelurahan nothing.
select is(pg_temp.split(pg_temp.combo_default(), 100000, array[5, 13]::smallint[]),
  'rw_treasury/5=50000 rw_treasury/13=50000',
  'the combo default pays two RWs half each and the kelurahan nothing');
select is(pg_temp.split(pg_temp.combo_default(), 100000, array[5, 13, 8]::smallint[]),
  'rw_treasury/5=33334 rw_treasury/13=33333 rw_treasury/8=33333',
  'three RWs a third each, the spare rupiah to the first leg by largest remainder');

-- The equal split beside a kelurahan line, in the shape the combo default had before (the kelurahan 20 %, the legs
-- 80 %), as a combo's own package rule may still say.
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
  ('00000000-0000-4000-8000-0000000c5009', 'combo', 'bagi-kelurahan-rata', 'Kelurahan dan rata', 'flat_group', 1500000,
   'draft');
insert into public.revenue_share_rules (id, scope, package_id, name) values
  ('00000000-0000-4000-8000-0000000c5404', 'package', '00000000-0000-4000-8000-0000000c5009', 'Kelurahan dan rata');
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000000c5404', 'kelurahan', null, 20.00),
  ('00000000-0000-4000-8000-0000000c5404', 'rw_treasury', null, 80.00);
create function pg_temp.kelurahan_and_legs() returns uuid
  language sql
as $$ select '00000000-0000-4000-8000-0000000c5404'::uuid; $$;

select is(pg_temp.split(pg_temp.kelurahan_and_legs(), 100000, array[5, 13]::smallint[]),
  'kelurahan=20000 rw_treasury/5=40000 rw_treasury/13=40000',
  'a combo of two RWs: 20 % to the kelurahan, 40 % to each RW');
select is(pg_temp.split(pg_temp.kelurahan_and_legs(), 100000, array[5, 13, 8]::smallint[]),
  'kelurahan=20000 rw_treasury/5=26667 rw_treasury/13=26667 rw_treasury/8=26666',
  'three RWs: 26 667, 26 667, 26 666 in leg order');
select is(pg_temp.split(pg_temp.kelurahan_and_legs(), 100000, array[8, 13, 5]::smallint[]),
  'kelurahan=20000 rw_treasury/8=26667 rw_treasury/13=26667 rw_treasury/5=26666',
  'the leftover rupiah follow the booking''s leg order, not the RW number');
select is(pg_temp.split(pg_temp.kelurahan_and_legs(), 100001, array[5, 13]::smallint[]),
  'kelurahan=20000 rw_treasury/5=40001 rw_treasury/13=40000',
  'an odd amount: the kelurahan keeps its 20 000, the extra rupiah goes to the first leg');
select is(pg_temp.split(pg_temp.kelurahan_and_legs(), 1, array[5, 13, 8]::smallint[]),
  'kelurahan=0 rw_treasury/5=1 rw_treasury/13=0 rw_treasury/8=0',
  'one rupiah goes whole to the first leg');
select is(pg_temp.split(pg_temp.kelurahan_and_legs(), 3, array[5, 13]::smallint[]),
  'kelurahan=1 rw_treasury/5=1 rw_treasury/13=1',
  'three rupiah: 0.6 to the kelurahan rounds up, the 2 left split one each');
select is((select sum(s.amount)::bigint from internal.revenue_split(pg_temp.combo_default(), 999983,
          array[5, 13, 8, 12]::smallint[]) s), 999983::bigint,
  'four legs and a prime amount still add up to the amount');

-- An RW package's default rule: its fixed line, nothing expanded.
select is(pg_temp.split(pg_temp.rw13_default(), 100001, array[13]::smallint[]),
  'rw_treasury/13=100001', 'an RW package of RW 13 pays RW 13 all of it');

select throws_ok(
  $$select * from internal.revenue_split(pg_temp.rw13_default(), 100000, array[5, 8]::smallint[])$$,
  'P0001', null, 'a line for an RW outside the booking is refused, never paid');
select throws_ok($$select * from internal.revenue_split(pg_temp.combo_default(), 100000, array[]::smallint[])$$,
  'P0001', null, 'an equal split over no legs is refused');
select throws_ok($$select * from internal.revenue_split(pg_temp.combo_default(), 100000, array[5, 5]::smallint[])$$,
  'P0001', null, 'and over a leg listed twice');
select throws_ok($$select * from internal.revenue_split(gen_random_uuid(), 100000, array[5]::smallint[])$$,
  'P0001', null, 'and a rule that does not exist');

-- ===== Who wins a tie, with real remainders (decision of 2026-10-22, Q1) =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000c5201', 5, 'bagi-vendor', 'Vendor Bagi');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, status) values
  ('00000000-0000-4000-8000-0000000c5202', 5, '00000000-0000-4000-8000-0000000c5201', 'bagi-produk', 'Produk Bagi',
   'souvenir', 20000, 'draft');
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
  ('00000000-0000-4000-8000-0000000c5003', 'combo', 'bagi-seri-1', 'Seri Satu', 'flat_group', 1500000, 'draft'),
  ('00000000-0000-4000-8000-0000000c5004', 'combo', 'bagi-seri-2', 'Seri Dua', 'flat_group', 1500000, 'draft');
insert into public.revenue_share_rules (id, scope, package_id, product_id, name) values
  ('00000000-0000-4000-8000-0000000c5301', 'package', '00000000-0000-4000-8000-0000000c5003', null, 'Seri kelurahan'),
  ('00000000-0000-4000-8000-0000000c5302', 'package', '00000000-0000-4000-8000-0000000c5004', null, 'Seri RW'),
  ('00000000-0000-4000-8000-0000000c5303', 'product', null, '00000000-0000-4000-8000-0000000c5202', 'Seri vendor');
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000000c5301', 'kelurahan', null, 50.00),
  ('00000000-0000-4000-8000-0000000c5301', 'rw_treasury', 5, 50.00),
  -- RW 13's line is written first, so a split that followed the order of writing would favour it.
  ('00000000-0000-4000-8000-0000000c5302', 'rw_treasury', 13, 50.00),
  ('00000000-0000-4000-8000-0000000c5302', 'rw_treasury', 5, 50.00),
  ('00000000-0000-4000-8000-0000000c5303', 'umkm_vendor', null, 50.00),
  ('00000000-0000-4000-8000-0000000c5303', 'rw_treasury', 5, 50.00);
select is(pg_temp.split('00000000-0000-4000-8000-0000000c5301', 3, array[5]::smallint[]),
  'kelurahan=2 rw_treasury/5=1', '3 at 50/50 ties at 1.5 each: the kelurahan wins the tie over an RW');
select is(pg_temp.split('00000000-0000-4000-8000-0000000c5302', 3, array[5, 13]::smallint[]),
  'rw_treasury/5=2 rw_treasury/13=1', 'two named RWs tie: the first leg wins, not the line written first');
select is(pg_temp.split('00000000-0000-4000-8000-0000000c5302', 3, array[13, 5]::smallint[]),
  'rw_treasury/13=2 rw_treasury/5=1', 'and with the legs the other way round, the other RW');
select is(pg_temp.split('00000000-0000-4000-8000-0000000c5303', 3, array[5]::smallint[]),
  'rw_treasury/5=2 umkm_vendor=1', 'an RW and a vendor tie: the RW wins, vendors come last');

-- ===== internal.resolve_package_rule: which rule a package's amount follows =====
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
  ('00000000-0000-4000-8000-0000000c5001', 'combo', 'bagi-kombo', 'Kombinasi Bagi', 'flat_group', 1500000, 'draft');
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c5002', 13, 'regular', 'bagi-rw13', 'Paket RW 13', 25000, 'draft'),
  ('00000000-0000-4000-8000-0000000c5007', 13, 'regular', 'bagi-rw13-versi', 'Paket RW 13 berversi', 25000, 'draft'),
  ('00000000-0000-4000-8000-0000000c5008', 13, 'regular', 'bagi-rw13-nanti', 'Paket RW 13 nanti', 25000, 'draft');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5001', public.today_jkt()),
  pg_temp.combo_default(), 'a combo without a rule of its own follows the combo default');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5002', public.today_jkt()),
  pg_temp.rw13_default(), 'an RW package follows its RW''s default');

insert into public.revenue_share_rules (id, scope, package_id, name) values
  ('00000000-0000-4000-8000-0000000c5101', 'package', '00000000-0000-4000-8000-0000000c5001', 'Kombinasi khusus');
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000000c5101', 'kelurahan', null, 10.00),
  ('00000000-0000-4000-8000-0000000c5101', 'rw_treasury', 5, 50.00),
  ('00000000-0000-4000-8000-0000000c5101', 'rw_treasury', 13, 40.00);
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5001', public.today_jkt()),
  '00000000-0000-4000-8000-0000000c5101'::uuid, 'a package rule of its own overrides the default');
select is(pg_temp.split('00000000-0000-4000-8000-0000000c5101', 100000, array[5, 13]::smallint[]),
  'kelurahan=10000 rw_treasury/5=50000 rw_treasury/13=40000', 'and splits as its own lines say');

-- Two versions of one package's rule, the first closed yesterday and the next in force from today, and a rule that
-- starts tomorrow.
insert into public.revenue_share_rules (id, scope, package_id, name, effective_from, effective_to) values
  ('00000000-0000-4000-8000-0000000c5401', 'package', '00000000-0000-4000-8000-0000000c5007', 'Versi lama',
   public.today_jkt() - 5, public.today_jkt() - 1),
  ('00000000-0000-4000-8000-0000000c5402', 'package', '00000000-0000-4000-8000-0000000c5007', 'Versi baru',
   public.today_jkt(), null),
  ('00000000-0000-4000-8000-0000000c5403', 'package', '00000000-0000-4000-8000-0000000c5008', 'Mulai besok',
   public.today_jkt() + 1, null);
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
select rule_id::uuid, 'kelurahan', null, 100.00
from unnest(array['00000000-0000-4000-8000-0000000c5401', '00000000-0000-4000-8000-0000000c5402',
                  '00000000-0000-4000-8000-0000000c5403']) as rule(rule_id);
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5007', public.today_jkt() - 1),
  '00000000-0000-4000-8000-0000000c5401'::uuid, 'a rule is in force on its last day');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5007', public.today_jkt()),
  '00000000-0000-4000-8000-0000000c5402'::uuid, 'and not the day after, when its next version is');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5008', public.today_jkt()),
  pg_temp.rw13_default(), 'a rule that starts tomorrow is not picked today');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5008', public.today_jkt() + 1),
  '00000000-0000-4000-8000-0000000c5403'::uuid, 'but is from its first day');

-- Two rules in force for one target are refused when they are written (independent review of PR #24, 1); should
-- one ever get past, resolve_package_rule still refuses to pick between them.
select throws_ok(
  $$insert into public.revenue_share_rules (scope, package_id, name)
    values ('package', '00000000-0000-4000-8000-0000000c5001', 'Kombinasi khusus kedua')$$,
  '23P01', null, 'a second rule in force for one package is refused when written');
select throws_ok(
  $$insert into public.revenue_share_rules (scope, rw_id, name) values ('package_default', 13, 'Bawaan kedua RW 13')$$,
  '23P01', null, 'and so is a second default in force for one RW');
set constraints revenue_share_rules_no_overlap deferred;
insert into public.revenue_share_rules (id, scope, package_id, name) values
  ('00000000-0000-4000-8000-0000000c5102', 'package', '00000000-0000-4000-8000-0000000c5001', 'Kombinasi khusus kedua');
insert into public.revenue_share_rules (id, scope, rw_id, name) values
  ('00000000-0000-4000-8000-0000000c5103', 'package_default', 13, 'Bawaan kedua RW 13');
select throws_ok($$select internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5001', public.today_jkt())$$,
  'P0001', null, 'with the check put off, two package rules in force are still refused at settlement');
select throws_ok($$select internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5002', public.today_jkt())$$,
  'P0001', null, 'and so are two defaults for one RW');
delete from public.revenue_share_rules where id in ('00000000-0000-4000-8000-0000000c5102',
                                                    '00000000-0000-4000-8000-0000000c5103');
set constraints revenue_share_rules_no_overlap immediate;

update public.revenue_share_rules set is_active = false
where scope = 'package_default' and rw_id = 13 and package_id is null and product_id is null;
select throws_ok($$select internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5002', public.today_jkt())$$,
  'P0001', null, 'and with no rule in force there is no fallback: refused');

select * from finish();
rollback;
