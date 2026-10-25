-- RLS matrix for the catalogue: tour_packages, tour_package_legs, tour_package_price_tiers, package_price_history,
-- umkm_vendors, products_umkm (docs/PRD.md §8.5.2, Task P1.4.02, P1.4.03, P1.9.02). Every check runs as an API role.
begin;
select plan(43);
\ir helpers/rls_personas.psql

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-00000000c501', 5, 'regular', 'p5', 'Paket RW 05', 25000, 'published'),
  ('00000000-0000-4000-8000-00000000c502', 5, 'regular', 'p5d', 'Draf RW 05', 25000, 'draft'),
  ('00000000-0000-4000-8000-00000000c801', 8, 'regular', 'p8', 'Paket RW 08', 25000, 'published'),
  ('00000000-0000-4000-8000-00000000c802', 8, 'regular', 'p8d', 'Draf RW 08', 25000, 'draft');
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status)
values ('00000000-0000-4000-8000-00000000c900', 'combo', 'pc', 'Paket Kombinasi', 'flat_group', 1500000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-00000000c900', 5, 1), ('00000000-0000-4000-8000-00000000c900', 8, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-00000000c900';
insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax) values
  ('00000000-0000-4000-8000-00000000c501', 1, 20, 25000), ('00000000-0000-4000-8000-00000000c801', 1, 20, 25000);
update public.tour_packages set price_per_pax = 26000
where id in ('00000000-0000-4000-8000-00000000c501', '00000000-0000-4000-8000-00000000c801');
insert into public.umkm_vendors (id, rw_id, slug, name, owner_name, phone, bank_name, is_active) values
  ('00000000-0000-4000-8000-00000000d501', 5, 'v5', 'Vendor RW 05', 'Bu Ani', '+6281200000501', 'BRI', true),
  ('00000000-0000-4000-8000-00000000d502', 5, 'v5i', 'Vendor Nonaktif', 'Pak Budi', '+6281200000502', null, false),
  ('00000000-0000-4000-8000-00000000d801', 8, 'v8', 'Vendor RW 08', 'Bu Cici', '+6281200000801', 'BNI', true);
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, status) values
  ('00000000-0000-4000-8000-00000000e501', 5, '00000000-0000-4000-8000-00000000d501', 'pr5', 'Kompos', 'compost', 15000, 'published'),
  ('00000000-0000-4000-8000-00000000e502', 5, '00000000-0000-4000-8000-00000000d501', 'pr5d', 'Bibit', 'seedling', 5000, 'draft'),
  ('00000000-0000-4000-8000-00000000e801', 8, '00000000-0000-4000-8000-00000000d801', 'pr8', 'Batik', 'souvenir', 50000, 'published');
create function pg_temp.is_fixture_package(p_id uuid) returns boolean
  language sql immutable
as $$
  select p_id in ('00000000-0000-4000-8000-00000000c501', '00000000-0000-4000-8000-00000000c502',
                  '00000000-0000-4000-8000-00000000c801', '00000000-0000-4000-8000-00000000c802',
                  '00000000-0000-4000-8000-00000000c900');
$$;
grant execute on function pg_temp.is_fixture_package(uuid) to anon, authenticated;

-- ===== anon =====
select pg_temp.act_as('anon');
select is((select string_agg(slug, ',' order by slug) from public.tour_packages where pg_temp.is_fixture_package(id)),
  'p5,p8,pc', 'anon sees the published packages, the combo included');
select throws_ok($$select created_by from public.tour_packages$$, '42501', null, 'but not who created them');
select is((select count(*)::int from public.tour_package_legs where pg_temp.is_fixture_package(package_id)), 4,
  'the legs of published packages');
select is((select count(*)::int from public.tour_package_price_tiers where pg_temp.is_fixture_package(package_id)), 2,
  'and their price tiers');
select is((select string_agg(slug, ',' order by slug) from public.umkm_vendors where slug in ('v5', 'v5i', 'v8')),
  'v5,v8', 'the active vendors');
select throws_ok($$select bank_name from public.umkm_vendors$$, '42501', null, 'never a vendor''s bank account');
select throws_ok($$select owner_name, phone from public.umkm_vendors$$, '42501', null, 'nor its owner''s name and phone');
select is((select string_agg(slug, ',' order by slug) from public.products_umkm where slug in ('pr5', 'pr5d', 'pr8')),
  'pr5,pr8', 'the published products');
select throws_ok($$select id from public.package_price_history$$, '42501', null, 'no price history');
select throws_ok($$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax)
  values (5, 'regular', 'palsu', 'Palsu', 25000)$$, '42501', null, 'and writes nothing');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.tour_packages where pg_temp.is_fixture_package(id))
  + (select count(*)::int from public.tour_package_legs where pg_temp.is_fixture_package(package_id))
  + (select count(*)::int from public.umkm_vendors where slug in ('v5', 'v5i', 'v8'))
  + (select count(*)::int from public.products_umkm where slug in ('pr5', 'pr5d', 'pr8')),
  0,
  'a user without a role sees no catalogue row'
);

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is((select string_agg(slug, ',' order by slug) from public.tour_packages where pg_temp.is_fixture_package(id)),
  'p5,p5d,pc', 'an RW admin sees their own packages, drafts included, and the combo that visits their RW');
select is(
  (select string_agg(distinct rw_id::text, ',') || ':' || count(*) from public.tour_package_legs
   where pg_temp.is_fixture_package(package_id)),
  '5:3',
  'but only the legs in their own RW, never RW 08''s leg of the combo'
);
select is((select count(*)::int from public.tour_package_price_tiers where pg_temp.is_fixture_package(package_id)), 1,
  'their own packages'' tiers only');
select lives_ok($$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax, created_by, updated_by)
  values (5, 'regular', 'p5-baru', 'Paket Baru', 25000, '00000000-0000-4000-8000-00000000f005',
          '00000000-0000-4000-8000-00000000f005')$$,
  'creates a package for their RW, signed with their own id as creator and last editor');
select throws_ok($$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax, created_by, updated_by)
  values (5, 'regular', 'p5-lain', 'Paket Lain', 25000, '00000000-0000-4000-8000-00000000f005',
          '00000000-0000-4000-8000-00000000f008')$$,
  '42501', null, 'and names nobody else as its last editor');
select throws_ok($$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax, created_by, updated_by)
  values (8, 'regular', 'p8-baru', 'Paket Baru', 25000, '00000000-0000-4000-8000-00000000f005',
          '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'but none for RW 08');
select throws_ok($$insert into public.tour_packages (category, slug, name, pricing_basis, flat_price, created_by, updated_by)
  values ('combo', 'pc-baru', 'Kombinasi Baru', 'flat_group', 1500000, '00000000-0000-4000-8000-00000000f005',
          '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'and no combo (REC-14)');
select is(pg_temp.row_count($$update public.tour_packages set price_per_pax = 30000,
  updated_by = '00000000-0000-4000-8000-00000000f005' where id = '00000000-0000-4000-8000-00000000c501'$$), 1,
  'reprices their own package, signing the edit');
select throws_ok($$update public.tour_packages set price_per_pax = 31000,
  updated_by = '00000000-0000-4000-8000-00000000f008' where id = '00000000-0000-4000-8000-00000000c501'$$,
  '42501', null, 'never signing it with someone else''s id');
select is(pg_temp.row_count($$update public.tour_packages set name = 'Diubah',
  updated_by = '00000000-0000-4000-8000-00000000f005' where id = '00000000-0000-4000-8000-00000000c900'$$), 0,
  'reads the combo but cannot edit it');
select is(pg_temp.row_count($$delete from public.tour_packages where id = '00000000-0000-4000-8000-00000000c502'$$), 0,
  'and deletes no package; an RW admin archives instead');
select throws_ok($$insert into public.tour_package_legs (package_id, rw_id, leg_order)
  values ('00000000-0000-4000-8000-00000000c900', 5, 3)$$, '42501',
  'an RW admin changes the legs of their own RW''s packages only', 'adds no leg to a combo');
select throws_ok($$insert into public.tour_package_legs (package_id, rw_id, leg_order)
  values ('00000000-0000-4000-8000-00000000c802', 5, 2)$$, '42501',
  'an RW admin changes the legs of their own RW''s packages only', 'nor to RW 08''s draft, which they cannot see');
select throws_ok($$insert into public.tour_package_legs (package_id, rw_id, leg_order)
  values ('00000000-0000-4000-8000-00000000c999', 5, 1)$$, '42501',
  'an RW admin changes the legs of their own RW''s packages only',
  'and a package that does not exist gets the same answer, so the guard reveals nothing');
select throws_ok($$insert into public.tour_package_legs (package_id, rw_id, leg_order)
  values ('00000000-0000-4000-8000-00000000c501', 8, 2)$$, 'P0001', 'an RW package visits its own RW only',
  'nor an RW 08 leg to their own package');
select lives_ok($$insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
  values ('00000000-0000-4000-8000-00000000c501', 21, null, 20000)$$, 'adds a price tier to their own package');
select throws_ok($$insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
  values ('00000000-0000-4000-8000-00000000c801', 21, null, 20000)$$, '42501', null, 'but not to RW 08''s');
select is(
  (select string_agg(distinct right(package_id::text, 4), ',') from public.package_price_history
   where pg_temp.is_fixture_package(package_id)),
  'c501',
  'reads the price history of their own packages only'
);
select is((select string_agg(slug, ',' order by slug) from public.umkm_vendors where slug in ('v5', 'v5i', 'v8')),
  'v5,v5i', 'sees their own RW''s vendors, inactive ones included');
select throws_ok($$select bank_name from public.umkm_vendors$$, '42501', null, 'but no bank account');
select throws_ok($$insert into public.umkm_vendors (rw_id, slug, name, created_by)
  values (5, 'v5-baru', 'Vendor Baru', '00000000-0000-4000-8000-00000000f005')$$, '42501', null,
  'adds no vendor, not even for their RW (the superadmin''s since 20261028080100)');
select is(pg_temp.row_count($$update public.umkm_vendors set name = 'Diubah'
  where id = '00000000-0000-4000-8000-00000000d801'$$), 0, 'edits no RW 08 vendor');
select is(pg_temp.row_count($$delete from public.umkm_vendors where id = '00000000-0000-4000-8000-00000000d502'$$), 0,
  'and deletes no vendor');
select is((select string_agg(slug, ',' order by slug) from public.products_umkm where slug in ('pr5', 'pr5d', 'pr8')),
  'pr5,pr5d', 'sees their own RW''s products, drafts included');
select throws_ok($$insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, created_by)
  values (5, '00000000-0000-4000-8000-00000000d501', 'pr5-baru', 'Produk Baru', 'other', 10000,
          '00000000-0000-4000-8000-00000000f005')$$, '42501', null, 'and adds none');

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select is((select string_agg(slug, ',' order by slug) from public.tour_packages where pg_temp.is_fixture_package(id)),
  'p8,p8d,pc', 'RW 08''s admin sees their own packages and the combo');
select is(
  (select count(*)::int from public.tour_package_legs where pg_temp.is_fixture_package(package_id) and rw_id = 5),
  0,
  'and no RW 05 leg'
);

-- ===== superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is((select count(*)::int from public.tour_packages where pg_temp.is_fixture_package(id)), 0,
  'without AAL2 the superadmin sees no package, published or not');
select throws_ok($$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax, created_by, updated_by)
  values (8, 'regular', 'p8-tanpa-totp', 'Tanpa TOTP', 25000, '00000000-0000-4000-8000-00000000f001',
          '00000000-0000-4000-8000-00000000f001')$$,
  '42501', null, 'and creates none');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.row_count($$update public.tour_packages set name = 'Kombinasi Baru',
  updated_by = '00000000-0000-4000-8000-00000000f001' where id = '00000000-0000-4000-8000-00000000c900'$$), 1,
  'at AAL2 the superadmin edits the combo');
select is(pg_temp.row_count($$delete from public.tour_packages where id = '00000000-0000-4000-8000-00000000c802'$$), 1,
  'and deletes a package');
select throws_ok($$select bank_name from public.umkm_vendors$$, '42501', null,
  'but reads no bank account through the API either');

select * from finish();
rollback;
