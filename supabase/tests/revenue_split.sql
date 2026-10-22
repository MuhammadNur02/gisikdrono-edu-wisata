-- The revenue split a settlement will post (Task P3.9.04; internal.allocate_revenue_share of Task P3.9.01 calls these).
-- Golden cases: integer IDR, largest remainder, parts that always add up to the amount, ties to the kelurahan, then the
-- RW treasuries in the booking's leg order, then vendors; a combo's RW share split equally over its legs; a package rule
-- over the default; and every refusal: no rule, an ambiguous rule, an RW outside the booking.
begin;
select plan(30);

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
create function pg_temp.combo_default() returns uuid
  language sql
as $$
  select r.id from public.revenue_share_rules r
  where r.scope = 'package_default' and r.rw_id is null and r.package_id is null and r.product_id is null and r.is_active;
$$;

select is(pg_temp.split(pg_temp.combo_default(), 100000, array[5, 13]::smallint[]),
  'kelurahan=20000 rw_treasury/5=40000 rw_treasury/13=40000',
  'a combo of two RWs: 20 % to the kelurahan, 40 % to each RW');
select is(pg_temp.split(pg_temp.combo_default(), 100000, array[5, 13, 8]::smallint[]),
  'kelurahan=20000 rw_treasury/5=26667 rw_treasury/13=26667 rw_treasury/8=26666',
  'three RWs: 26 667, 26 667, 26 666 in leg order');
select is(pg_temp.split(pg_temp.combo_default(), 100000, array[8, 13, 5]::smallint[]),
  'kelurahan=20000 rw_treasury/8=26667 rw_treasury/13=26667 rw_treasury/5=26666',
  'the leftover rupiah follow the booking''s leg order, not the RW number');
select is(pg_temp.split(pg_temp.combo_default(), 100001, array[5, 13]::smallint[]),
  'kelurahan=20000 rw_treasury/5=40001 rw_treasury/13=40000',
  'an odd amount: the kelurahan keeps its 20 000, the extra rupiah goes to the first leg');
select is(pg_temp.split(pg_temp.combo_default(), 1, array[5, 13, 8]::smallint[]),
  'kelurahan=0 rw_treasury/5=1 rw_treasury/13=0 rw_treasury/8=0',
  'one rupiah goes whole to the first leg');
select is(pg_temp.split(pg_temp.combo_default(), 3, array[5, 13]::smallint[]),
  'kelurahan=1 rw_treasury/5=1 rw_treasury/13=1',
  'three rupiah: 0.6 to the kelurahan rounds up, the 2 left split one each');
select is((select sum(s.amount)::bigint from internal.revenue_split(pg_temp.combo_default(), 999983,
          array[5, 13, 8, 12]::smallint[]) s), 999983::bigint,
  'four legs and a prime amount still add up to the amount');

-- An RW package's default rule: its fixed lines, nothing expanded.
select is(pg_temp.split((select r.id from public.revenue_share_rules r where r.scope = 'package_default' and r.rw_id = 13
                         and r.is_active), 100001, array[13]::smallint[]),
  'kelurahan=20000 rw_treasury/13=80001', 'an RW package of RW 13 pays RW 13 80 %');

select throws_ok(
  $$select * from internal.revenue_split(
      (select r.id from public.revenue_share_rules r where r.scope = 'package_default' and r.rw_id = 13 and r.is_active),
      100000, array[5, 8]::smallint[])$$,
  'P0001', null, 'a line for an RW outside the booking is refused, never paid');
select throws_ok($$select * from internal.revenue_split(pg_temp.combo_default(), 100000, array[]::smallint[])$$,
  'P0001', null, 'an equal split over no legs is refused');
select throws_ok($$select * from internal.revenue_split(pg_temp.combo_default(), 100000, array[5, 5]::smallint[])$$,
  'P0001', null, 'and over a leg listed twice');
select throws_ok($$select * from internal.revenue_split(gen_random_uuid(), 100000, array[5]::smallint[])$$,
  'P0001', null, 'and a rule that does not exist');

-- ===== internal.resolve_package_rule: which rule a package's amount follows =====
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
  ('00000000-0000-4000-8000-0000000c5001', 'combo', 'bagi-kombo', 'Kombinasi Bagi', 'flat_group', 1500000, 'draft');
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c5002', 13, 'regular', 'bagi-rw13', 'Paket RW 13', 25000, 'draft');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5001', public.today_jkt()),
  pg_temp.combo_default(), 'a combo without a rule of its own follows the combo default');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5002', public.today_jkt()),
  (select r.id from public.revenue_share_rules r where r.scope = 'package_default' and r.rw_id = 13 and r.is_active),
  'an RW package follows its RW''s default');

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

insert into public.revenue_share_rules (id, scope, package_id, name) values
  ('00000000-0000-4000-8000-0000000c5102', 'package', '00000000-0000-4000-8000-0000000c5001', 'Kombinasi khusus kedua');
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000000c5102', 'kelurahan', null, 100.00);
select throws_ok($$select internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5001', public.today_jkt())$$,
  'P0001', null, 'two current rules for one package are ambiguous, so it is refused');

update public.revenue_share_rules set is_active = false
where scope = 'package_default' and rw_id = 13 and package_id is null and product_id is null;
select throws_ok($$select internal.resolve_package_rule('00000000-0000-4000-8000-0000000c5002', public.today_jkt())$$,
  'P0001', null, 'and with no rule in force there is no fallback: refused');

select * from finish();
rollback;
