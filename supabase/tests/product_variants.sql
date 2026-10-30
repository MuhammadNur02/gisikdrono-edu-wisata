-- Product prices behind a switch and product variants (decisions of 2026-10-30, docs/PRD.md §13.1 A29 decisions 7 and
-- 8; 20261105170000 to 20261105170200): a product may have no price yet, never a price of 0, and never be an add-on
-- without one; catalogue.show_product_prices is a public boolean, off; and product_variants follows its product: anon
-- reads the variants of a published product only, staff read their own RW's, the superadmin alone writes them at AAL2,
-- a variant keeps its product, shows one of its product's photos, has a label of its own, and a product has at most 20.
begin;
select plan(34);
\ir helpers/rls_personas.psql

insert into public.umkm_vendors (id, rw_id, slug, name, is_active) values
  ('00000000-0000-4000-8000-0000000a7051', 5, 'uji-varian-vendor-05', 'Vendor Varian 05', true),
  ('00000000-0000-4000-8000-0000000a7081', 8, 'uji-varian-vendor-08', 'Vendor Varian 08', true);
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, status, image_paths) values
  ('00000000-0000-4000-8000-0000000a7a05', 5, '00000000-0000-4000-8000-0000000a7051', 'uji-varian-vest', 'Vest Perca',
   'recycled_craft', null, 'published',
   array['rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp',
         'rw-05/products/00000000-0000-4000-8000-0000000a7a05/merah.webp']),
  ('00000000-0000-4000-8000-0000000a7d05', 5, '00000000-0000-4000-8000-0000000a7051', 'uji-varian-draf', 'Tas Draf',
   'recycled_craft', 25000, 'draft', '{}'),
  ('00000000-0000-4000-8000-0000000a7a08', 8, '00000000-0000-4000-8000-0000000a7081', 'uji-varian-08', 'Gelang 08',
   'souvenir', 10000, 'published', '{}');
insert into public.product_variants (id, product_id, label, image_path, sort_order) values
  ('00000000-0000-4000-8000-0000000a7b01', '00000000-0000-4000-8000-0000000a7a05', 'Motif Biru',
   'rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp', 0),
  ('00000000-0000-4000-8000-0000000a7b02', '00000000-0000-4000-8000-0000000a7a05', 'Motif Merah',
   'rw-05/products/00000000-0000-4000-8000-0000000a7a05/merah.webp', 1),
  ('00000000-0000-4000-8000-0000000a7b03', '00000000-0000-4000-8000-0000000a7d05', 'Hijau', null, 0),
  ('00000000-0000-4000-8000-0000000a7b08', '00000000-0000-4000-8000-0000000a7a08', 'Perak', null, 0);

create function pg_temp.variant_labels(p_product_id uuid) returns text
  language sql stable
as $$
  select string_agg(label || ':' || sort_order || ':' || is_available || ':' || coalesce(image_path, '-'), ', '
                    order by sort_order)
  from public.product_variants where product_id = p_product_id;
$$;
create function pg_temp.visible_variants(p_product_ids uuid[]) returns integer
  language sql stable
as $$ select count(*)::integer from public.product_variants where product_id = any (p_product_ids); $$;
grant execute on function pg_temp.visible_variants(uuid[]) to anon, authenticated;

-- ===== The price (decision 7) =====
select col_is_null('public', 'products_umkm', 'price', 'a product may be saved without a price');
select throws_ok(
  $$insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price)
    values (5, '00000000-0000-4000-8000-0000000a7051', 'uji-varian-gratis', 'Gratis', 'other', 0)$$,
  '23514', null, 'but never with a price of 0, which would read as Rp 0'
);
\ir helpers/addons_on.psql
select throws_ok(
  $$update public.products_umkm set is_addon_eligible = true where id = '00000000-0000-4000-8000-0000000a7a05'$$,
  '23514', null, 'and a product without a price is never an add-on, even with add-ons switched back on'
);
select lives_ok(
  $$update public.products_umkm set is_addon_eligible = true where id = '00000000-0000-4000-8000-0000000a7d05'$$,
  'while one with a price may be, once add-ons return'
);
select is(
  (select is_public::text || ':' || value::text from public.site_settings where key = 'catalogue.show_product_prices'),
  'true:false',
  'the price switch is a public setting, seeded off'
);
select throws_ok(
  $$update public.site_settings set value = '"true"' where key = 'catalogue.show_product_prices'$$,
  '23514', null, 'and it holds a JSON boolean only'
);
select pg_temp.act_as('anon');
select is((select value::text from public.site_settings where key = 'catalogue.show_product_prices'), 'false',
  'anon reads it, so the public product reads can follow it');
reset role;

-- ===== Table hygiene =====
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.product_variants'::regclass),
  'product_variants has RLS enabled and forced'
);
select is(
  array(select privilege_type::text from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'product_variants' and grantee = 'anon' order by 1),
  array[]::text[],
  'anon holds no table-wide right on product_variants, only the columns it reads'
);

-- ===== Reads =====
select pg_temp.act_as('anon');
select is(pg_temp.visible_variants(array['00000000-0000-4000-8000-0000000a7a05']::uuid[]), 2,
  'anon reads the variants of a published product');
select is(pg_temp.visible_variants(array['00000000-0000-4000-8000-0000000a7d05']::uuid[]), 0,
  'and none of an unpublished one');
select throws_ok(
  $$insert into public.product_variants (product_id, label) values ('00000000-0000-4000-8000-0000000a7a05', 'Anon')$$,
  '42501', null, 'anon writes no variant'
);
reset role;
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.visible_variants(array['00000000-0000-4000-8000-0000000a7a05',
                                         '00000000-0000-4000-8000-0000000a7d05']::uuid[]), 3,
  'admin_rw 05 reads every variant of RW 05''s products, a draft''s included');
select is(pg_temp.visible_variants(array['00000000-0000-4000-8000-0000000a7a08']::uuid[]), 0,
  'and none of RW 08''s');
reset role;
select pg_temp.act_as('admin_rw_08');
select is(pg_temp.visible_variants(array['00000000-0000-4000-8000-0000000a7a05',
                                         '00000000-0000-4000-8000-0000000a7d05']::uuid[]), 0,
  'admin_rw 08 reads none of RW 05''s variants');
reset role;
select pg_temp.act_as('superadmin_aal1');
select is(pg_temp.visible_variants(array['00000000-0000-4000-8000-0000000a7a05',
                                         '00000000-0000-4000-8000-0000000a7a08']::uuid[]), 0,
  'the superadmin at AAL1 reads none (product_variants_aal2)');
reset role;

-- ===== Writes: the superadmin's, as products are =====
select pg_temp.act_as('admin_rw_05');
select throws_ok(
  $$insert into public.product_variants (product_id, label) values ('00000000-0000-4000-8000-0000000a7a05', 'Kuning')$$,
  '42501', null, 'admin_rw 05 adds no variant, even to RW 05''s own product (products are the superadmin''s)'
);
update public.product_variants set label = 'Diubah' where id = '00000000-0000-4000-8000-0000000a7b01';
delete from public.product_variants where id = '00000000-0000-4000-8000-0000000a7b02';
select throws_ok(
  $$select public.save_product_variants('00000000-0000-4000-8000-0000000a7a05',
      '[{"label": "Kuning", "image_path": null, "is_available": true}]')$$,
  '42501', null, 'nor through save_product_variants'
);
reset role;
select is(pg_temp.variant_labels('00000000-0000-4000-8000-0000000a7a05'),
  'Motif Biru:0:true:rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp, '
  || 'Motif Merah:1:true:rw-05/products/00000000-0000-4000-8000-0000000a7a05/merah.webp',
  'and its update and delete change nothing');
select pg_temp.act_as('admin_rw_08');
select throws_ok(
  $$insert into public.product_variants (product_id, label) values ('00000000-0000-4000-8000-0000000a7a05', 'Silang')$$,
  '42501', null, 'admin_rw 08 writes nothing of RW 05''s'
);
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok(
  $$select public.save_product_variants('00000000-0000-4000-8000-0000000a7a05',
      '[{"label": "Kuning", "image_path": null, "is_available": true}]')$$,
  '42501', null, 'the superadmin at AAL1 writes none either'
);
reset role;

select pg_temp.act_as('superadmin_aal2');
select lives_ok(
  $$select public.save_product_variants('00000000-0000-4000-8000-0000000a7a05', '[
      {"label": "Motif Merah", "image_path": "rw-05/products/00000000-0000-4000-8000-0000000a7a05/merah.webp",
       "is_available": true},
      {"label": "Motif Biru", "image_path": "rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp",
       "is_available": false},
      {"label": "Motif Polos", "image_path": null, "is_available": true}]')$$,
  'the superadmin at AAL2 saves a product''s variants, reordered and two names swapped in place'
);
reset role;
select is(pg_temp.variant_labels('00000000-0000-4000-8000-0000000a7a05'),
  'Motif Merah:0:true:rw-05/products/00000000-0000-4000-8000-0000000a7a05/merah.webp, '
  || 'Motif Biru:1:false:rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp, Motif Polos:2:true:-',
  'in the order given, sort_order its position');
select ok(
  (select count(*) > 0 from public.audit_logs
   where entity_type = 'product_variants' and action = 'product_variants.insert'
     and actor_id = '00000000-0000-4000-8000-00000000f001'),
  'each written variant is audited under the superadmin'
);
create temporary table audit_before on commit drop as
  select count(*) as n from public.audit_logs where entity_type = 'product_variants';
select pg_temp.act_as('superadmin_aal2');
select public.save_product_variants('00000000-0000-4000-8000-0000000a7a05', '[
  {"label": "Motif Merah", "image_path": "rw-05/products/00000000-0000-4000-8000-0000000a7a05/merah.webp",
   "is_available": true},
  {"label": "Motif Biru", "image_path": "rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp",
   "is_available": false},
  {"label": "Motif Polos", "image_path": null, "is_available": true}]');
select throws_ok(
  $$select public.save_product_variants('00000000-0000-4000-8000-0000000a7a05',
      '[{"label": "Kuning", "image_path": null, "is_available": true, "price": 1}]')$$,
  '22023', null, 'a variant carries a label, an image_path and is_available, nothing else'
);
reset role;
select is((select count(*) from public.audit_logs where entity_type = 'product_variants'),
  (select n from audit_before), 'saving the same variants again writes nothing');

-- ===== The row =====
select throws_ok(
  $$insert into public.product_variants (product_id, label) values ('00000000-0000-4000-8000-0000000a7a05', 'motif polos')$$,
  '23505', null, 'a product names a variant once, whatever its case'
);
select throws_ok(
  $$insert into public.product_variants (product_id, label) values ('00000000-0000-4000-8000-0000000a7a05', ' Kuning')$$,
  '23514', null, 'a label is trimmed'
);
select throws_ok(
  $$insert into public.product_variants (product_id, label)
    values ('00000000-0000-4000-8000-0000000a7a05', repeat('a', 61))$$,
  '23514', null, 'and 60 characters at most'
);
select throws_ok(
  $$insert into public.product_variants (product_id, label, image_path)
    values ('00000000-0000-4000-8000-0000000a7a05', 'Kuning', 'rw-05/products/00000000-0000-4000-8000-0000000a7d05/x.webp')$$,
  '23514', null, 'a variant shows one of its own product''s photos only'
);
select throws_ok(
  $$update public.product_variants set product_id = '00000000-0000-4000-8000-0000000a7a08'
    where id = '00000000-0000-4000-8000-0000000a7b03'$$,
  'P0001', null, 'a variant stays with its product, so it never moves to another RW'
);
update public.products_umkm set image_paths = array['rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp']
where id = '00000000-0000-4000-8000-0000000a7a05';
select is(pg_temp.variant_labels('00000000-0000-4000-8000-0000000a7a05'),
  'Motif Merah:0:true:-, Motif Biru:1:false:rw-05/products/00000000-0000-4000-8000-0000000a7a05/biru.webp, '
  || 'Motif Polos:2:true:-',
  'a photo taken off the product is taken off its variants');
insert into public.product_variants (product_id, label, sort_order)
select '00000000-0000-4000-8000-0000000a7a08', 'Warna ' || n, n from generate_series(1, 19) as n;
select throws_ok(
  $$insert into public.product_variants (product_id, label) values ('00000000-0000-4000-8000-0000000a7a08', 'Warna 20')$$,
  'P0001', null, 'a product has at most 20 variants'
);
delete from public.products_umkm where id = '00000000-0000-4000-8000-0000000a7a08';
select is(pg_temp.visible_variants(array['00000000-0000-4000-8000-0000000a7a08']::uuid[]), 0,
  'a deleted product takes its variants with it');

select * from finish();
rollback;
