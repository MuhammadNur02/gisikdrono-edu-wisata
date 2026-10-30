-- UMKM through the Koperasi Merah Putih (decisions of 2026-10-29, docs/PRD.md §13.1; 20261105160100 to 20261105160300):
-- no product is an add-on of a visit any more, and a booking without add-ons prices as before while one with an add-on
-- is refused; the Kopdes order number and pickup address are public settings, seeded as placeholders, checked at the
-- row and audited without their values; and the sellers behind the products are no public information, while the
-- products stay public and staff keep their access.
begin;
select plan(25);
\ir helpers/rls_personas.psql

insert into public.umkm_vendors (id, rw_id, slug, name, owner_name, phone, is_active) values
  ('00000000-0000-4000-8000-0000000b5051', 5, 'uji-kopdes-vendor-05', 'Vendor Kopdes 05', 'Bu Kopdes', '+6281200005051',
   true),
  ('00000000-0000-4000-8000-0000000b5081', 8, 'uji-kopdes-vendor-08', 'Vendor Kopdes 08', 'Pak Kopdes', '+6281200005081',
   true);
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, status) values
  ('00000000-0000-4000-8000-0000000b5a05', 5, '00000000-0000-4000-8000-0000000b5051', 'uji-kopdes-kompos',
   'Kompos Kopdes', 'compost', 15000, 'kantong', 'published');
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000b5105', 5, 'regular', 'uji-kopdes-paket', 'Paket Kopdes', 'per_pax', 30000,
   'published');

-- ===== Add-ons switched off (decision 2) =====
select is((select count(*)::int from public.products_umkm where is_addon_eligible), 0,
  'no product is on sale as an add-on of a visit');
select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'products_umkm' and column_name = 'is_addon_eligible'),
  'false',
  'and a new product starts switched off'
);
select is(
  (internal.booking_quote('00000000-0000-4000-8000-0000000b5105', 20, '[]', array[5]::smallint[]) -> 'lines')
    -> 0 ->> 'line_total',
  '600000',
  'a visit without add-ons prices as before'
);
select throws_ok(
  $$select internal.booking_quote('00000000-0000-4000-8000-0000000b5105', 20,
      '[{"product_id": "00000000-0000-4000-8000-0000000b5a05", "qty": 2}]', array[5]::smallint[])$$,
  'P0001', null,
  'while an add-on line is refused, so a stale wizard draft cannot book one'
);
select throws_ok(
  $$update public.products_umkm set is_addon_eligible = true where id = '00000000-0000-4000-8000-0000000b5a05'$$,
  '23514', null, 'and no write may make a product an add-on again (products_umkm_addons_switched_off)'
);
select ok(
  (select count(*) > 0 from information_schema.tables where table_schema = 'public' and table_name = 'booking_addons'),
  'booking_addons stays, so the bookings that hold add-ons keep them'
);

-- ===== The Kopdes settings (decision 3) =====
select is(
  (select string_agg(key || ':' || is_public, ',' order by key) from public.site_settings
   where key in ('contact.kopdes_whatsapp_number', 'contact.kopdes_address')),
  'contact.kopdes_address:true,contact.kopdes_whatsapp_number:true',
  'the Kopdes number and address are seeded as public settings'
);
select ok(
  (select array['contact.kopdes_address', 'contact.kopdes_whatsapp_number'] <@ array(select internal.placeholder_site_settings())),
  'as placeholders, so the go-live check stays red until they are filled in'
);
select throws_ok(
  $$update public.site_settings set value = '"081234567890"' where key = 'contact.kopdes_whatsapp_number'$$,
  '23514', null, 'a number without +62 is refused at the row'
);
select throws_ok(
  $$update public.site_settings set value = '6281234567890' where key = 'contact.kopdes_whatsapp_number'$$,
  '23514', null, 'and so is a number that is no text'
);
select throws_ok(
  $$update public.site_settings set value = '"   "' where key = 'contact.kopdes_address'$$,
  '23514', null, 'and an empty address'
);
update public.site_settings set value = '"+6281298765432"' where key = 'contact.kopdes_whatsapp_number';
update public.site_settings set value = '"Jl. Contoh No. 1, Gisikdrono"' where key = 'contact.kopdes_address';
select is(
  (select count(*) filter (where before ? 'value' or after ? 'value') || '/' || count(*) from public.audit_logs
   where entity_type = 'site_settings' and entity_id in ('contact.kopdes_whatsapp_number', 'contact.kopdes_address')
     and action = 'site_settings.update' and occurred_at >= now()),
  '0/2',
  'a change of either is audited without its value, as for every contact.* key'
);
select pg_temp.act_as('anon');
select is(
  (select string_agg(key || '=' || value, ',' order by key) from public.site_settings
   where key in ('contact.kopdes_whatsapp_number', 'contact.kopdes_address')),
  'contact.kopdes_address="Jl. Contoh No. 1, Gisikdrono",contact.kopdes_whatsapp_number="+6281298765432"',
  'the public site reads both'
);

-- ===== The sellers stay private (decision 5) =====
select throws_ok($$select id from public.umkm_vendors$$, '42501', null, 'anon reads no vendor, not even its id');
select throws_ok($$select name, slug from public.umkm_vendors$$, '42501', null, 'nor its name');
select throws_ok($$select description_md, logo_path from public.umkm_vendors$$, '42501', null,
  'nor its story or logo');
select is(
  (select string_agg(slug, ',') from public.products_umkm where id = '00000000-0000-4000-8000-0000000b5a05'),
  'uji-kopdes-kompos',
  'the product stays public'
);
select throws_ok($$select vendor_id from public.products_umkm$$, '42501', null,
  'without the id of its seller (20261105160600)');
reset role;
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'umkm_vendors' and 'anon' = any (roles)),
  0,
  'no policy of umkm_vendors names anon'
);
select ok(not has_any_column_privilege('anon', 'public.umkm_vendors', 'select'),
  'and anon holds no column of it');

select pg_temp.act_as('superadmin_aal2');
select is(
  (select string_agg(slug, ',' order by slug) from public.umkm_vendors where slug like 'uji-kopdes-vendor-%'),
  'uji-kopdes-vendor-05,uji-kopdes-vendor-08',
  'the superadmin still sees every vendor'
);
reset role;
select pg_temp.act_as('admin_rw_05');
select is(
  (select string_agg(slug || '/' || owner_name, ',' order by slug) from public.umkm_vendors
   where slug like 'uji-kopdes-vendor-%'),
  'uji-kopdes-vendor-05/Bu Kopdes',
  'an RW admin still sees their own RW''s vendors only, as before'
);
reset role;
select ok(
  not has_column_privilege('authenticated', 'public.umkm_vendors', 'bank_account_number', 'select')
  and not has_column_privilege('authenticated', 'public.umkm_vendors', 'bank_name', 'select'),
  'the bank columns stay granted to no API role'
);
select pg_temp.act_as('admin_rw_08');
select is(
  (select string_agg(slug, ',') from public.umkm_vendors where slug like 'uji-kopdes-vendor-%'),
  'uji-kopdes-vendor-08',
  'and so does RW 08''s admin'
);
reset role;
select pg_temp.act_as('admin_rw_13');
select is(
  (select count(*)::int from public.umkm_vendors where slug like 'uji-kopdes-vendor-%'),
  0,
  'and RW 13''s admin sees neither'
);
reset role;

select * from finish();
rollback;
