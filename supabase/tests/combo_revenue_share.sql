-- A combo pays any number of RWs (decision of 2026-10-21, Task P3.9.04, 20261022100000_combo_revenue_share_any_rws.sql):
-- its default rule pays the kelurahan 20 % and the RWs of the booking's legs 80 % in equal parts, written as an
-- rw_treasury line without an RW. The 0008 rule that named RW 05 and RW 08 is closed.
begin;
select plan(17);

-- ===== The combo's default rule =====
select is(
  (select string_agg(l.beneficiary || case when l.beneficiary = 'rw_treasury' and l.rw_id is null then '/legs'
                                        else coalesce('/' || l.rw_id, '') end || '=' || l.pct, ' '
                     order by l.beneficiary, l.rw_id)
   from public.revenue_share_rules r join public.revenue_share_rule_lines l on l.rule_id = r.id
   where r.scope = 'package_default' and r.rw_id is null and r.package_id is null and r.product_id is null
     and r.is_active and r.effective_from <= public.today_jkt()
     and (r.effective_to is null or r.effective_to >= public.today_jkt())),
  'kelurahan=20.00 rw_treasury/legs=80.00',
  'the one current combo default pays the kelurahan 20 % and the booking''s RWs 80 % between them'
);
select is(
  (select count(*)::int from public.revenue_share_rules r
   where r.scope = 'package_default' and r.rw_id is null and r.package_id is null and r.product_id is null
     and r.is_active),
  1,
  'there is exactly one active combo default'
);
select is(
  (select string_agg(r.is_active::text, ',') from public.revenue_share_rules r
   where r.name = 'Bawaan paket kombinasi'),
  'false',
  'the 0008 rule naming RW 05 and RW 08 is closed'
);
select ok(
  (select bool_and(r.effective_to is not null) from public.revenue_share_rules r
   where r.name = 'Bawaan paket kombinasi'),
  'with an end date, so its period reads as closed too'
);

-- ===== What a rule line may name =====
-- One package or product per rule, since two rules in force for one target are refused (revenue_share_rules_no_overlap).
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000c4002', 5, 'uji-kombo-vendor', 'Vendor Uji');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, status)
select product_id::uuid, 5, '00000000-0000-4000-8000-0000000c4002', slug, 'Produk Uji', 'souvenir', 20000, 'draft'
from (values ('00000000-0000-4000-8000-0000000c4005', 'uji-kombo-produk-1'),
             ('00000000-0000-4000-8000-0000000c4008', 'uji-kombo-produk-2'),
             ('00000000-0000-4000-8000-0000000c4009', 'uji-kombo-produk-3')) as product(product_id, slug);
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price)
select package_id::uuid, 'combo', slug, 'Kombinasi Uji', 'flat_group', 1000000
from (values ('00000000-0000-4000-8000-0000000c4003', 'uji-kombo-1'), ('00000000-0000-4000-8000-0000000c4004', 'uji-kombo-2'),
             ('00000000-0000-4000-8000-0000000c4006', 'uji-kombo-3'), ('00000000-0000-4000-8000-0000000c4007', 'uji-kombo-4'))
  as package(package_id, slug);
insert into public.revenue_share_rules (id, scope, package_id, product_id, name) values
  ('00000000-0000-4000-8000-0000000c4001', 'package', '00000000-0000-4000-8000-0000000c4003', null, 'Uji rata'),
  ('00000000-0000-4000-8000-0000000c4011', 'package', '00000000-0000-4000-8000-0000000c4004', null, 'Uji dua baris rata'),
  ('00000000-0000-4000-8000-0000000c4012', 'package', '00000000-0000-4000-8000-0000000c4006', null, 'Uji rata dan RW'),
  ('00000000-0000-4000-8000-0000000c4014', 'package', '00000000-0000-4000-8000-0000000c4007', null, 'Uji jumlah'),
  ('00000000-0000-4000-8000-0000000c4013', 'product', null, '00000000-0000-4000-8000-0000000c4005', 'Uji produk rata'),
  ('00000000-0000-4000-8000-0000000c4015', 'product', null, '00000000-0000-4000-8000-0000000c4008', 'Uji produk');

select lives_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
      ('00000000-0000-4000-8000-0000000c4001', 'kelurahan', null, 30.00),
      ('00000000-0000-4000-8000-0000000c4001', 'rw_treasury', null, 70.00)$$,
  'an rw_treasury line may leave its RW out, meaning the RWs of the booking''s legs'
);
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
    values ('00000000-0000-4000-8000-0000000c4001', 'kelurahan', 5, 0.00)$$,
  '23514', null, 'a kelurahan line still names no RW');
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, vendor_id, pct)
    values ('00000000-0000-4000-8000-0000000c4001', 'rw_treasury', null,
            '00000000-0000-4000-8000-0000000c4002', 0.00)$$,
  '23514', null, 'and an rw_treasury line names no vendor');
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
    values ('00000000-0000-4000-8000-0000000c4001', 'umkm_vendor', 5, 0.00)$$,
  '23514', null, 'nor a vendor line an RW');
-- Independent review of PR #24, 2: a line per beneficiary, so a split never depends on which duplicate came first.
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
    values ('00000000-0000-4000-8000-0000000c4001', 'kelurahan', null, 0.00)$$,
  '23505', null, 'a rule names each beneficiary once');

-- ===== The shape of an equal split (decision of 2026-10-22, Q3 and Q4) =====
select lives_ok($$set constraints revenue_rule_shape_guard immediate$$,
  'a package rule with one equal-split line and the kelurahan passes the shape check');
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
      ('00000000-0000-4000-8000-0000000c4011', 'rw_treasury', null, 50.00),
      ('00000000-0000-4000-8000-0000000c4011', 'rw_treasury', null, 50.00)$$,
  '23505', null, 'a rule has one equal-split line at most');
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
      ('00000000-0000-4000-8000-0000000c4012', 'rw_treasury', null, 60.00),
      ('00000000-0000-4000-8000-0000000c4012', 'rw_treasury', 5, 40.00)$$,
  'P0001', 'a revenue rule splits the RWs'' share equally in one line, with no RW named beside it',
  'and names no RW beside it');
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
      ('00000000-0000-4000-8000-0000000c4013', 'umkm_vendor', null, 90.00),
      ('00000000-0000-4000-8000-0000000c4013', 'rw_treasury', null, 10.00)$$,
  'P0001', 'only a package''s rule may split the RWs'' share equally over the booking''s legs',
  'and only a package''s rule splits over the legs: an add-on''s RW is named');
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000000c4015', 'umkm_vendor', null, 90.00),
  ('00000000-0000-4000-8000-0000000c4015', 'rw_treasury', 5, 10.00);
select throws_ok(
  $$update public.revenue_share_rule_lines set rw_id = null
    where rule_id = '00000000-0000-4000-8000-0000000c4015' and beneficiary = 'rw_treasury'$$,
  'P0001', 'only a package''s rule may split the RWs'' share equally over the booking''s legs',
  'an update that turns a product rule''s RW line into an equal split is refused');
select throws_ok(
  $$update public.revenue_share_rule_lines set beneficiary = 'rw_treasury', rw_id = 5
    where rule_id = '00000000-0000-4000-8000-0000000c4001' and beneficiary = 'kelurahan'$$,
  'P0001', 'a revenue rule splits the RWs'' share equally in one line, with no RW named beside it',
  'and so is one that names an RW beside an equal split');
select throws_ok(
  $$update public.revenue_share_rules
    set scope = 'product', package_id = null, product_id = '00000000-0000-4000-8000-0000000c4009'
    where id = '00000000-0000-4000-8000-0000000c4001';
    set constraints revenue_rule_scope_shape_guard immediate$$,
  'P0001', 'only a package''s rule may split the RWs'' share equally over the booking''s legs',
  'nor does a package rule with an equal split turn into a product rule');

-- ===== The lines still add up to 100 % (revenue_rule_sum_guard, 0004) =====
-- On a rule with no equal split, so the shape check cannot answer first (independent review of PR #24, 4).
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
  ('00000000-0000-4000-8000-0000000c4014', 'kelurahan', null, 30.00),
  ('00000000-0000-4000-8000-0000000c4014', 'rw_treasury', 5, 70.00);
select throws_ok(
  $$set constraints revenue_rule_sum_guard immediate;
    insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
    values ('00000000-0000-4000-8000-0000000c4014', 'rw_treasury', 13, 10.00)$$,
  'P0001', 'the shares of a revenue rule must add up to 100 % (got 110.00)', 'and the shares still add up to 100 %');

select * from finish();
rollback;
