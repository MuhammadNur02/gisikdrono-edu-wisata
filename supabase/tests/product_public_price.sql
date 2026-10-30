-- Review of PR #115 (20261105170300, 20261105170400): H1, the price anon may read is products_umkm.public_price, which
-- the triggers keep equal to price while catalogue.show_product_prices is on and NULL while it is off, and anon holds
-- no right on price itself; L1 to L3, save_product writes a product and its variants in one transaction, and
-- save_product_variants refuses anyone but the superadmin at AAL2 even with an empty list.
begin;
select plan(23);
\ir helpers/rls_personas.psql

insert into public.umkm_vendors (id, rw_id, slug, name, is_active) values
  ('00000000-0000-4000-8000-0000000a8051', 5, 'uji-harga-vendor-05', 'Vendor Harga 05', true);
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, status) values
  ('00000000-0000-4000-8000-0000000a8a05', 5, '00000000-0000-4000-8000-0000000a8051', 'uji-harga-kompos', 'Kompos Harga',
   'compost', 15000, 'published'),
  ('00000000-0000-4000-8000-0000000a8b05', 5, '00000000-0000-4000-8000-0000000a8051', 'uji-harga-kosong', 'Tanpa Harga',
   'compost', null, 'published');

create function pg_temp.public_prices() returns text
  language sql stable
as $$
  select string_agg(slug || '=' || coalesce(public_price::text, '-'), ', ' order by slug)
  from public.products_umkm where slug in ('uji-harga-kompos', 'uji-harga-kosong');
$$;
grant execute on function pg_temp.public_prices() to anon, authenticated;
create temporary table audit_before on commit drop as
  select count(*) as n from public.audit_logs where entity_type = 'products_umkm'
    and entity_id in ('00000000-0000-4000-8000-0000000a8a05', '00000000-0000-4000-8000-0000000a8b05');

-- ===== The grants =====
select ok(not has_column_privilege('anon', 'public.products_umkm', 'price', 'SELECT'),
  'anon holds no right on products_umkm.price, so the anon key cannot read a price the switch hides');
select ok(has_column_privilege('anon', 'public.products_umkm', 'public_price', 'SELECT'),
  'anon reads public_price instead');
select ok(has_column_privilege('authenticated', 'public.products_umkm', 'price', 'SELECT'),
  'staff keep the price itself');
select ok(
  not has_column_privilege('authenticated', 'public.products_umkm', 'public_price', 'INSERT')
  and not has_column_privilege('authenticated', 'public.products_umkm', 'public_price', 'UPDATE'),
  'and no API role writes public_price, which only the triggers set'
);

-- ===== The switch off: no public price =====
select is(pg_temp.public_prices(), 'uji-harga-kompos=-, uji-harga-kosong=-',
  'while catalogue.show_product_prices is off, no product has a public price');
select pg_temp.act_as('anon');
select is(pg_temp.public_prices(), 'uji-harga-kompos=-, uji-harga-kosong=-', 'and anon reads none');
select throws_ok($$select price from public.products_umkm where slug = 'uji-harga-kompos'$$, '42501', null,
  'and is refused the price column outright');
reset role;

-- ===== The switch on: the price, then off again =====
select pg_temp.act_as('superadmin_aal2');
update public.site_settings set value = 'true', updated_by = '00000000-0000-4000-8000-00000000f001'
  where key = 'catalogue.show_product_prices';
reset role;
select is(pg_temp.public_prices(), 'uji-harga-kompos=15000, uji-harga-kosong=-',
  'the superadmin turning it on shows every price at once, and a product without one stays without');
select pg_temp.act_as('anon');
select is(pg_temp.public_prices(), 'uji-harga-kompos=15000, uji-harga-kosong=-', 'which anon now reads');
reset role;
update public.products_umkm set price = 17000 where slug = 'uji-harga-kompos';
select is(pg_temp.public_prices(), 'uji-harga-kompos=17000, uji-harga-kosong=-', 'a new price follows at once');
update public.products_umkm set public_price = null where slug = 'uji-harga-kompos';
select is(pg_temp.public_prices(), 'uji-harga-kompos=17000, uji-harga-kosong=-',
  'and a direct write of public_price is overwritten from the switch');
insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, status)
values (5, '00000000-0000-4000-8000-0000000a8051', 'uji-harga-baru', 'Baru', 'compost', 9000, 'draft');
select is((select public_price from public.products_umkm where slug = 'uji-harga-baru'), 9000::bigint,
  'a product added while it is on gets its public price');
update public.site_settings set value = 'false' where key = 'catalogue.show_product_prices';
select is(pg_temp.public_prices(), 'uji-harga-kompos=-, uji-harga-kosong=-', 'turning it off hides every price again');
select is(
  (select count(*) from public.audit_logs where entity_type = 'products_umkm'
     and entity_id in ('00000000-0000-4000-8000-0000000a8a05', '00000000-0000-4000-8000-0000000a8b05')),
  (select n from audit_before) + 1,
  'a flip writes no audit row per product; only the price change of 17000 does'
);

-- ===== save_product: a product and its variants in one transaction =====
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.save_product(
  jsonb_build_object('rw_id', 5, 'vendor_id', '00000000-0000-4000-8000-0000000a8051', 'slug', 'uji-simpan-vest',
    'name', 'Vest Perca', 'category', 'recycled_craft', 'description_md', null, 'price', null, 'unit_label', 'pcs',
    'min_order_qty', 1, 'max_order_qty', null, 'lead_time_days', 0, 'is_addon_eligible', false, 'is_available', true,
    'is_featured', false, 'image_paths', '[]'::jsonb, 'status', 'draft', 'sort_order', 0),
  null,
  '[{"label": "Biru", "image_path": null, "is_available": true},
    {"label": "Merah", "image_path": null, "is_available": false}]')$$,
  'the superadmin at AAL2 saves a new product without a price, with its variants');
reset role;
select is(
  (select p.created_by::text || ':' || count(v.id) from public.products_umkm p
   left join public.product_variants v on v.product_id = p.id where p.slug = 'uji-simpan-vest' group by p.created_by),
  '00000000-0000-4000-8000-00000000f001:2',
  'signed with the superadmin''s own id, both variants written'
);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.save_product(
  jsonb_build_object('rw_id', 5, 'vendor_id', '00000000-0000-4000-8000-0000000a8051', 'slug', 'uji-simpan-gagal',
    'name', 'Gagal', 'category', 'other', 'description_md', null, 'price', 5000, 'unit_label', 'pcs',
    'min_order_qty', 1, 'max_order_qty', null, 'lead_time_days', 0, 'is_addon_eligible', false, 'is_available', true,
    'is_featured', false, 'image_paths', '[]'::jsonb, 'status', 'draft', 'sort_order', 0),
  null,
  '[{"label": "Biru", "image_path": null, "is_available": true},
    {"label": "biru", "image_path": null, "is_available": true}]')$$,
  '23505', null, 'a variant list the table refuses refuses the whole save');
reset role;
select is((select count(*)::int from public.products_umkm where slug = 'uji-simpan-gagal'), 0,
  'so no product is left behind without its variants (review of PR #115, L1)');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.save_product('{"name": "Kurang"}', null, '[]')$$, '22023', null,
  'a product is saved with all of its fields and nothing else');
select lives_ok($$select public.save_product(
  jsonb_build_object('vendor_id', '00000000-0000-4000-8000-0000000a8051', 'slug', 'uji-simpan-vest',
    'name', 'Vest Perca Baru', 'category', 'recycled_craft', 'description_md', null, 'price', 85000,
    'unit_label', 'pcs', 'min_order_qty', 1, 'max_order_qty', null, 'lead_time_days', 0, 'is_addon_eligible', false,
    'is_available', true, 'is_featured', false, 'image_paths', '[]'::jsonb, 'status', 'draft', 'sort_order', 0),
  (select id from public.products_umkm where slug = 'uji-simpan-vest'),
  '[{"label": "Hijau", "image_path": null, "is_available": true}]')$$,
  'and an existing one is updated with its variants replaced');
reset role;
select is(
  (select p.name || ':' || p.price || ':' || string_agg(v.label, ',') from public.products_umkm p
   join public.product_variants v on v.product_id = p.id where p.slug = 'uji-simpan-vest' group by p.name, p.price),
  'Vest Perca Baru:85000:Hijau', 'its fields and variants as saved');

-- ===== Who may save =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.save_product(
  jsonb_build_object('rw_id', 5, 'vendor_id', '00000000-0000-4000-8000-0000000a8051', 'slug', 'uji-simpan-admin',
    'name', 'Admin', 'category', 'other', 'description_md', null, 'price', null, 'unit_label', 'pcs',
    'min_order_qty', 1, 'max_order_qty', null, 'lead_time_days', 0, 'is_addon_eligible', false, 'is_available', true,
    'is_featured', false, 'image_paths', '[]'::jsonb, 'status', 'draft', 'sort_order', 0), null, '[]')$$,
  '42501', null, 'admin_rw 05 saves no product, even of RW 05');
select throws_ok($$select public.save_product_variants('00000000-0000-4000-8000-0000000a8a05', '[]')$$, '42501', null,
  'nor an empty variant list, which is refused rather than a silent success (L3)');
reset role;

select * from finish();
rollback;
