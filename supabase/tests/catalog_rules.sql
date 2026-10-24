-- Task P4.3.11, P4.9.03 and P2.5.04 (20261028080100) and the review Lows of PR #56 (20261028080000): save_package
-- writes a package, a combo's legs in order, its tiers and its status in one transaction under the caller's own
-- rights; vendors and products are the superadmin's to write; only what is archived (or a banner switched off) is
-- deleted; the superadmin alone sets an RW's accent, icon and schedule; a moved position is no longer an estimate; a
-- vendor's ledger share counts for its RW; an export past 50 000 rows is refused without building a row, and its hit
-- on the hourly cap stays counted.
begin;
select plan(36);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
-- The fields of a package, as save_package takes them; p_rw names its RW on a new one.
create function pg_temp.package_fields(p_slug text, p_category text, p_status text, p_rw smallint default null)
  returns jsonb
  language sql immutable
as $$
  select jsonb_build_object('category', p_category, 'slug', p_slug, 'name', 'Paket ' || p_slug, 'tagline', null,
           'description_md', null, 'highlights', '[]'::jsonb, 'inclusions', '[]'::jsonb, 'itinerary', '[]'::jsonb,
           'duration_minutes', 120, 'pricing_basis', 'per_pax', 'price_per_pax', 30000, 'flat_price', null,
           'min_pax', 1, 'max_pax', 200, 'image_paths', '[]'::jsonb, 'is_featured', false, 'status', p_status,
           'sort_order', 0, 'valid_from', null, 'valid_to', null)
         || case when p_rw is null and p_category <> 'combo' then '{}'::jsonb
                 else jsonb_build_object('rw_id', p_rw) end;
$$;
-- save_package with the package's id first, as these tests read best; the same rights, it runs as the caller.
create function pg_temp.save(p_id uuid, p_fields jsonb, p_legs smallint[] default null, p_tiers jsonb default '[]')
  returns uuid
  language sql
as $$ select public.save_package(p_fields, p_id, p_legs, p_tiers); $$;
grant execute on function pg_temp.save(uuid, jsonb, smallint[], jsonb) to authenticated;
create temporary table saved (name text primary key, id uuid) on commit drop;
grant select, insert on saved to authenticated;
create function pg_temp.saved(p_name text) returns uuid
  language sql stable
as $$ select id from saved where name = p_name; $$;
create function pg_temp.legs(p_package uuid) returns text
  language sql stable security definer
as $$ select string_agg(l.rw_id::text, ',' order by l.leg_order) from public.tour_package_legs l where l.package_id = p_package; $$;
create function pg_temp.tiers(p_package uuid) returns text
  language sql stable security definer
as $$
  select string_agg(t.min_pax || '-' || coalesce(t.max_pax::text, '') || ':' || t.price_per_pax, ',' order by t.min_pax)
  from public.tour_package_price_tiers t where t.package_id = p_package;
$$;
grant execute on function pg_temp.package_fields(text, text, text, smallint), pg_temp.saved(text),
  pg_temp.legs(uuid), pg_temp.tiers(uuid) to authenticated;

-- ===== save_package =====
select pg_temp.act_as('admin_rw_05');
insert into saved values ('rw05', pg_temp.save(null, pg_temp.package_fields('uji-simpan-05', 'regular',
  'published', 5::smallint), null,
  '[{"min_pax": 1, "max_pax": 10, "price_per_pax": 30000}, {"min_pax": 11, "max_pax": null, "price_per_pax": 25000}]'));
reset role;
select is((select (p.status::text, p.created_by, p.updated_by)::text from public.tour_packages p
           where p.id = pg_temp.saved('rw05')),
  ('published', pg_temp.persona_id('admin_rw_05'), pg_temp.persona_id('admin_rw_05'))::text,
  'an RW admin saves a package of their RW, published, signed by them');
select is((pg_temp.legs(pg_temp.saved('rw05')), pg_temp.tiers(pg_temp.saved('rw05')))::text,
  ('5', '1-10:30000,11-:25000')::text, 'with its single leg and its tiers');

select pg_temp.act_as('admin_rw_05');
select lives_ok($$select pg_temp.save(pg_temp.saved('rw05'),
                    pg_temp.package_fields('uji-simpan-05', 'student', 'published') - 'rw_id', null,
                    '[{"min_pax": 1, "max_pax": 20, "price_per_pax": 28000},
                      {"min_pax": 21, "max_pax": null, "price_per_pax": 22000}]')$$,
  'new tiers whose ranges overlap the old ones save in one go');
reset role;
select is((pg_temp.tiers(pg_temp.saved('rw05')), (select p.category::text from public.tour_packages p
                                                  where p.id = pg_temp.saved('rw05')))::text,
  ('1-20:28000,21-:22000', 'student')::text, 'and replace them');
create function pg_temp.tier_id(p_package uuid, p_min integer) returns uuid
  language sql stable security definer
as $$ select t.id from public.tour_package_price_tiers t where t.package_id = p_package and t.min_pax = p_min; $$;
grant execute on function pg_temp.tier_id(uuid, integer) to authenticated;
create temporary table kept_tiers on commit drop as
  select pg_temp.tier_id(pg_temp.saved('rw05'), 1) as small, pg_temp.tier_id(pg_temp.saved('rw05'), 21) as large;
grant select on kept_tiers to authenticated;
select pg_temp.act_as('admin_rw_05');
select lives_ok($$select pg_temp.save(pg_temp.saved('rw05'),
                    pg_temp.package_fields('uji-simpan-05', 'student', 'published') - 'rw_id', null,
                    jsonb_build_array(
                      jsonb_build_object('id', (select small from kept_tiers), 'min_pax', 1, 'max_pax', 30,
                                         'price_per_pax', 28000),
                      jsonb_build_object('id', (select large from kept_tiers), 'min_pax', 31, 'max_pax', null,
                                         'price_per_pax', 21000)))$$,
  'the boundary between two kept tiers moves up in one save');
select throws_ok($$select pg_temp.save(pg_temp.saved('rw05'),
                    pg_temp.package_fields('uji-simpan-05', 'student', 'published') - 'rw_id', null,
                    '[{"id": "00000000-0000-4000-8000-0000000cffff", "min_pax": 1, "price_per_pax": 1}]')$$,
  '22023', null, 'and a tier the package does not have is refused');
reset role;
select is((pg_temp.tiers(pg_temp.saved('rw05')),
           pg_temp.tier_id(pg_temp.saved('rw05'), 1) = (select small from kept_tiers),
           pg_temp.tier_id(pg_temp.saved('rw05'), 31) = (select large from kept_tiers))::text,
  ('1-30:28000,31-:21000', true, true)::text, 'each kept tier keeps its id, so its history goes on');

select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.save(null, pg_temp.package_fields('uji-kombo-05', 'combo', 'draft'),
                    array[5, 13]::smallint[])$$,
  '42501', null, 'an RW admin saves no combo');
select throws_ok($$select pg_temp.save(pg_temp.saved('rw05'),
                    pg_temp.package_fields('uji-simpan-05', 'regular', 'draft', 5::smallint))$$,
  '22023', null, 'an existing package names no RW');
select throws_ok($$select pg_temp.save(null,
                    pg_temp.package_fields('uji-simpan-lagi', 'regular', 'draft', 5::smallint) - 'tagline')$$,
  '22023', null, 'and a package is saved with all of its fields');
select throws_ok($$select pg_temp.save(null, pg_temp.package_fields('uji-simpan-kaki', 'regular', 'draft',
                    5::smallint), array[13]::smallint[])$$,
  '22023', null, 'an RW package visits its own RW only');
reset role;
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
values ('00000000-0000-4000-8000-0000000c3013', 13, 'regular', 'uji-simpan-13', 'Paket 13', 'per_pax', 30000, 'draft');
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.save('00000000-0000-4000-8000-0000000c3013',
                    pg_temp.package_fields('uji-simpan-13', 'regular', 'draft') - 'rw_id')$$,
  'P0002', null, 'nor saves another RW''s package');
reset role;

select pg_temp.act_as('superadmin_aal2');
insert into saved values ('combo', pg_temp.save(null, pg_temp.package_fields('uji-kombo', 'combo', 'published'),
  array[13, 5]::smallint[]));
reset role;
select is((pg_temp.legs(pg_temp.saved('combo')), (select p.status::text from public.tour_packages p
                                                 where p.id = pg_temp.saved('combo')))::text,
  ('13,5', 'published')::text, 'the superadmin saves a combo, its legs in order and published once they are written');
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select pg_temp.save(pg_temp.saved('combo'),
                    pg_temp.package_fields('uji-kombo', 'combo', 'published') - 'rw_id', array[5, 13]::smallint[])$$,
  'a reordered combo saves');
reset role;
select is(pg_temp.legs(pg_temp.saved('combo')), '5,13', 'with its legs in the new order');
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select pg_temp.save(pg_temp.saved('combo'),
                    pg_temp.package_fields('uji-kombo', 'combo', 'published') - 'rw_id')$$,
  'a combo saved without legs keeps the ones it has');
reset role;
select is(pg_temp.legs(pg_temp.saved('combo')), '5,13', 'in their order');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select pg_temp.save(null, pg_temp.package_fields('uji-kombo-satu', 'combo', 'published'),
                    array[5]::smallint[])$$,
  'P0001', null, 'a combo of one RW is not published');
select throws_ok($$select pg_temp.save(null, pg_temp.package_fields('uji-kombo-dua', 'combo', 'draft'),
                    array[5, 5]::smallint[])$$,
  '22023', null, 'and a combo visits each RW once');
reset role;
select is((select count(*)::int from public.tour_packages p where p.slug in ('uji-kombo-satu', 'uji-kombo-dua')),
  0, 'a refused save leaves nothing behind');

-- ===== Vendors and products =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000c4005', 5, 'uji-vendor-05', 'Vendor Uji 05');
select pg_temp.act_as('admin_rw_05');
select throws_ok($$insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, created_by)
                   values (5, '00000000-0000-4000-8000-0000000c4005', 'uji-produk-05', 'Produk Uji', 'snack', 10000,
                           '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'an RW admin adds no product');
select is(pg_temp.row_count($$update public.umkm_vendors set name = 'Ganti' where id = '00000000-0000-4000-8000-0000000c4005'$$),
  0, 'nor edits a vendor of their RW');
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, created_by)
                  values (5, '00000000-0000-4000-8000-0000000c4005', 'uji-produk-05', 'Produk Uji', 'snack', 10000,
                          '00000000-0000-4000-8000-00000000f001')$$,
  'the superadmin adds one');
reset role;

-- ===== Deletes: archived first =====
insert into public.galleries (id, rw_id, category, media_type, storage_path, caption, alt_text, status) values
  ('00000000-0000-4000-8000-0000000c5001', 5, 'activity', 'image', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000c5001.webp', 'Uji', 'Uji', 'published'),
  ('00000000-0000-4000-8000-0000000c5002', 5, 'activity', 'image', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000c5002.webp', 'Uji', 'Uji', 'archived');
insert into public.activity_points (id, rw_id, slug, name, point_type, status) values
  ('00000000-0000-4000-8000-0000000c6001', 5, 'uji-titik-1', 'Titik Uji', 'other', 'published'),
  ('00000000-0000-4000-8000-0000000c6002', 5, 'uji-titik-2', 'Titik Uji', 'other', 'archived');
insert into public.hero_banners (id, title, image_path, is_active) values
  ('00000000-0000-4000-8000-0000000c7001', 'Uji', 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-0000000c7001.webp', true),
  ('00000000-0000-4000-8000-0000000c7002', 'Uji', 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-0000000c7002.webp', false);
select pg_temp.act_as('admin_rw_05');
select is((pg_temp.row_count($$delete from public.galleries where id = '00000000-0000-4000-8000-0000000c5001'$$),
           pg_temp.row_count($$delete from public.galleries where id = '00000000-0000-4000-8000-0000000c5002'$$))::text,
  '(0,1)', 'a gallery item is deleted once archived');
select is((pg_temp.row_count($$delete from public.activity_points where id = '00000000-0000-4000-8000-0000000c6001'$$),
           pg_temp.row_count($$delete from public.activity_points where id = '00000000-0000-4000-8000-0000000c6002'$$))::text,
  '(0,1)', 'so is an activity point');
select is(pg_temp.row_count($$update public.activity_points set name = 'Titik Ganti'
                              where id = '00000000-0000-4000-8000-0000000c6001'$$),
  1, 'which its RW admin still edits');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((pg_temp.row_count($$delete from public.hero_banners where id = '00000000-0000-4000-8000-0000000c7001'$$),
           pg_temp.row_count($$delete from public.hero_banners where id = '00000000-0000-4000-8000-0000000c7002'$$))::text,
  '(0,1)', 'a banner is deleted once switched off');
reset role;
select is((select array_agg(p.policyname::text order by p.policyname) from pg_policies p
           where p.schemaname = 'public' and p.cmd = 'DELETE'
             and p.policyname in ('articles_super_delete', 'booklets_super_delete', 'performance_schedules_staff_delete')
             and p.qual like '%archived%'),
  array['articles_super_delete', 'booklets_super_delete', 'performance_schedules_staff_delete'],
  'articles, booklets and schedules are deleted once archived too');

-- ===== rw_units =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$update public.rw_units set accent_key = 'terracotta' where id = 5$$, '42501', null,
  'an RW admin does not choose their RW''s accent');
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$update public.rw_units set accent_key = 'terracotta', schedule_enabled = true where id = 5$$,
  'the superadmin does');
reset role;

-- ===== location_estimated =====
update public.activity_points set lat = -6.99, lng = 110.38, location_estimated = true
where id = '00000000-0000-4000-8000-0000000c6001';
select is((select location_estimated from public.activity_points where id = '00000000-0000-4000-8000-0000000c6001'),
  true, 'a write that says so keeps a position an estimate');
update public.activity_points set lat = -6.991 where id = '00000000-0000-4000-8000-0000000c6001';
select is((select location_estimated from public.activity_points where id = '00000000-0000-4000-8000-0000000c6001'),
  false, 'a moved point is no longer one');
update public.rw_units set location_estimated = true where id = 5;
update public.rw_units set map_lat = coalesce(map_lat, 0) + 0.001 where id = 5;
select is((select location_estimated from public.rw_units where id = 5), false, 'nor is a moved RW centre');

-- ===== A vendor's share is its RW's (review of PR #56, 1) =====
create function pg_temp.any_booking() returns uuid
  language sql stable
as $$ select b.id from public.bookings b order by b.created_at limit 1; $$;
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status)
values ('00000000-0000-4000-8000-0000000c3005', 5, 'regular', 'uji-buku-besar', 'Paket Buku', 'per_pax', 30000,
        'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000c2051', 5, public.today_jkt() + 11, '07:59', '08:59', 'Uji buku besar', 200);
insert into public.guest_otps (id, purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
values ('00000000-0000-4000-8000-0000000c8001', 'booking_phone', '+6281300008001', repeat('a', 64), repeat('b', 64),
        now() + interval '5 minutes', now() - interval '1 minute', now() - interval '2 minutes');
create temporary table ledger_booking on commit drop as
  select (internal.create_booking('00000000-0000-4000-8000-0000000c3005',
            array['00000000-0000-4000-8000-0000000c2051']::uuid[], 2,
            '{"booker_type": "individual", "institution_name": null, "pic_name": "Ani Buku", "pic_phone": "+6281300008001",
              "pic_email": "buku8001@contoh.test", "notes": null}', '[]', '[]', 'pay', 'web', null,
            '00000000-0000-4000-8000-0000000c8001', '{"version": "2026-10-18"}', null,
            '{"ip": null, "user_agent": "pgTAP"}',
            internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000c3005', 2, '[]',
                                                               array[5]::smallint[]))) ->> 'booking_id')::uuid as id;
insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
  rw_id, vendor_id, base_amount, pct, amount)
values ((select id from ledger_booking), 'settlement', 'addon:uji', '{}', 'umkm_vendor',
        'vendor:00000000-0000-4000-8000-0000000c4005', null, '00000000-0000-4000-8000-0000000c4005', 10000, 100, 10000);
select pg_temp.act_as('admin_rw_05');
select is((select (d ->> 'rw_id')::int
           from jsonb_array_elements(public.revenue_recap(public.today_jkt() - 1, public.today_jkt() + 1) -> 'daily') as d
           where d ->> 'beneficiary_key' = 'vendor:00000000-0000-4000-8000-0000000c4005'),
  5, 'an RW admin''s recap holds their vendor''s share, under their RW');
reset role;

-- ===== EXPORT_TOO_LARGE (review of PR #56, 2 and 5) =====
insert into public.security_events (event_type, severity, details, occurred_at)
select 'rate_limited', 'info', '{}', now() from generate_series(1, 50001);
select pg_temp.act_as('superadmin_aal2');
select is(public.rpc_create_export('audit', 'csv', jsonb_build_object('from', public.today_jkt(), 'to',
                                   public.today_jkt()), 'Pemeriksaan jejak audit hari ini') - 'row_count',
  '{"refused": "EXPORT_TOO_LARGE"}', 'an export past 50 000 rows is refused without a row');
reset role;
select is((select (count(*)::int, (select r.count from public.rate_limit_buckets r
                                   where r.key = 'export:user:' || pg_temp.persona_id('superadmin_aal2')))::text
           from public.exports e where e.requested_by = pg_temp.persona_id('superadmin_aal2')
             and e.kind = 'audit' and e.created_at = now()),
  '(0,1)', 'records nothing, and its hit on the hourly cap stays counted');

select * from finish();
rollback;
