-- Structure test for 0003_tables, extended group by group: exact columns, the types other code
-- relies on, keys, and the CHECK / unique rules proven by trying to break them.
begin;
select plan(74);

-- ===== Every table: RLS from birth, no API rights, updated_at kept by trigger =====

select is(
  array(
    select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and not (c.relrowsecurity and c.relforcerowsecurity)
    order by 1
  ),
  array[]::text[],
  'every public table has RLS enabled and forced'
);

-- 0005_policies_grants is the first migration allowed to grant anything to the API roles.
select is(
  array(
    select distinct table_name::text from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
    order by 1
  ),
  array[]::text[],
  'anon and authenticated have no rights on any public table before 0005'
);

select is(
  array(
    select c.table_name::text from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = format('public.%I', c.table_name)::regclass
          and t.tgname = 'set_updated_at' and not t.tgisinternal
      )
    order by 1
  ),
  array[]::text[],
  'every table with updated_at has the set_updated_at trigger'
);

-- docs/PRD.md §8.1: money is whole IDR in bigint, and money columns are named *_amount, *_price, *_total.
select is(
  array(
    select table_name || '.' || column_name from information_schema.columns
    where table_schema = 'public'
      and (column_name ~ '(^|_)(amount|price|total)$' or column_name ~ 'price_per_pax$')
      and data_type <> 'bigint'
    order by 1
  ),
  array[]::text[],
  'every money column is bigint'
);

-- ===== Configuration and staff (Task P1.2.03) =====

select columns_are('public', 'rw_units', array[
  'id', 'code', 'slug', 'name', 'theme_label', 'tagline', 'description_md', 'vision_md',
  'hero_image_path', 'contact_phone', 'contact_email', 'treasury_bank_name',
  'treasury_account_number', 'treasury_account_holder', 'map_lat', 'map_lng', 'is_active',
  'sort_order', 'created_at', 'updated_at'
]);
select columns_are('public', 'profiles', array[
  'id', 'email', 'full_name', 'phone', 'role', 'rw_id', 'is_active', 'mfa_required',
  'claims_version', 'avatar_path', 'last_login_at', 'created_by', 'created_at', 'updated_at'
]);
select columns_are('public', 'staff_invites', array[
  'id', 'email', 'role', 'rw_id', 'invite_code_hash', 'expires_at', 'accepted_at',
  'accepted_user_id', 'revoked_at', 'created_by', 'created_at'
]);
select columns_are('public', 'site_settings', array[
  'key', 'value', 'is_public', 'description', 'updated_by', 'updated_at'
]);

select col_type_is('public', 'rw_units', 'id', 'smallint', 'rw_units.id is the RW number as smallint');
select col_type_is('public', 'profiles', 'role', 'public', 'app_role', 'profiles.role is app_role');
select col_type_is('public', 'profiles', 'email', 'extensions', 'citext', 'profiles.email is citext');
select col_type_is('public', 'staff_invites', 'email', 'extensions', 'citext', 'staff_invites.email is citext');
select col_type_is('public', 'profiles', 'claims_version', 'integer', 'profiles.claims_version is integer');
select col_type_is('public', 'site_settings', 'value', 'jsonb', 'site_settings.value is jsonb');

select col_is_pk('public', 'site_settings', 'key', 'site_settings is keyed by key');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id');
select fk_ok('public', 'profiles', 'rw_id', 'public', 'rw_units', 'id');
select fk_ok('public', 'staff_invites', 'created_by', 'public', 'profiles', 'id');
select is(
  (select confdeltype from pg_constraint
   where conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass),
  'r'::"char",
  'an auth user with a profile cannot be deleted (on delete restrict)'
);

-- Fixtures for the behaviour checks below; everything is rolled back at the end.
insert into public.rw_units (id, code, slug, name, theme_label) values
  (5, 'RW05', 'rw-05-ecowastreme', 'RW 05 Ecowastreme', 'Ekowisata & Lingkungan'),
  (8, 'RW08', 'rw-08-kampung-seni-budaya', 'RW 08 Kampung Seni Budaya', 'Seni & Budaya')
on conflict (id) do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'superadmin@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'admin05@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'other@example.test');
insert into public.profiles (id, email, full_name, role) values
  ('00000000-0000-4000-8000-000000000001', 'superadmin@example.test', 'Super Admin', 'superadmin');

select throws_ok(
  $$insert into public.rw_units (id, code, slug, name, theme_label) values (9, 'RW9', 'rw-09', 'x', 'x')$$,
  '23514', null, 'rw_units.code must look like RW05'
);
select throws_ok(
  $$insert into public.rw_units (id, code, slug, name, theme_label) values (9, 'RW09', 'RW 09', 'x', 'x')$$,
  '23514', null, 'rw_units.slug must be a lowercase slug'
);
select throws_ok(
  $$insert into public.rw_units (id, code, slug, name, theme_label, contact_phone)
    values (9, 'RW09', 'rw-09', 'x', 'x', '081234567890')$$,
  '23514', null, 'rw_units.contact_phone must be +62 E.164'
);
select throws_ok(
  $$insert into public.profiles (id, email, full_name, role)
    values ('00000000-0000-4000-8000-000000000002', 'admin05@example.test', 'Admin', 'admin_rw')$$,
  '23514', null, 'an admin_rw profile needs an RW'
);
select throws_ok(
  $$insert into public.profiles (id, email, full_name, role, rw_id)
    values ('00000000-0000-4000-8000-000000000002', 'admin05@example.test', 'Admin', 'superadmin', 5)$$,
  '23514', null, 'a superadmin profile has no RW'
);
select lives_ok(
  $$insert into public.profiles (id, email, full_name, role, rw_id)
    values ('00000000-0000-4000-8000-000000000002', 'admin05@example.test', 'Admin 05', 'admin_rw', 5)$$,
  'an admin_rw profile with RW 05 is accepted'
);
select throws_ok(
  $$insert into public.profiles (id, email, full_name)
    values ('00000000-0000-4000-8000-000000000003', 'SuperAdmin@Example.test', 'Copy')$$,
  '23505', null, 'profile emails are unique regardless of case (citext)'
);

select throws_ok(
  $$insert into public.staff_invites (email, role, invite_code_hash, expires_at, created_by)
    values ('new@example.test', 'none', 'hash-0', now() + interval '72 hours', '00000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'an invite never grants the none role'
);
select throws_ok(
  $$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
    values ('new@example.test', 'superadmin', 8, 'hash-1', now() + interval '72 hours', '00000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a superadmin invite has no RW'
);
insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
values ('new@example.test', 'admin_rw', 8, 'hash-2', now() + interval '72 hours', '00000000-0000-4000-8000-000000000001');
select throws_ok(
  $$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
    values ('NEW@example.test', 'admin_rw', 8, 'hash-3', now() + interval '72 hours', '00000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'only one open invite per email'
);
update public.staff_invites set revoked_at = now() where invite_code_hash = 'hash-2';
select lives_ok(
  $$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
    values ('new@example.test', 'admin_rw', 8, 'hash-4', now() + interval '72 hours', '00000000-0000-4000-8000-000000000001')$$,
  'a revoked invite frees the email for a new one'
);

select throws_ok(
  $$insert into public.site_settings (key, value) values ('Booking Enabled', 'true')$$,
  '23514', null, 'site_settings keys are lowercase dotted names'
);
insert into public.site_settings (key, value, updated_at) values ('test.probe', '1', '2000-01-01');
update public.site_settings set value = '2' where key = 'test.probe';
select is(
  (select updated_at from public.site_settings where key = 'test.probe'),
  now(),
  'set_updated_at moves updated_at on update'
);

-- ===== Sessions and quota (Task P1.2.04) =====

select columns_are('public', 'session_templates', array[
  'id', 'rw_id', 'weekday', 'label', 'start_time', 'end_time', 'capacity', 'is_active',
  'created_at', 'updated_at'
]);
select columns_are('public', 'visit_sessions', array[
  'id', 'rw_id', 'session_date', 'start_time', 'end_time', 'label', 'capacity', 'reserved_pax',
  'checked_in_pax', 'status', 'template_id', 'notes', 'created_by', 'created_at', 'updated_at'
]);

select col_type_is('public', 'visit_sessions', 'status', 'public', 'session_status', 'visit_sessions.status is session_status');
select col_type_is('public', 'visit_sessions', 'reserved_pax', 'integer', 'reserved_pax is an integer counter');
select col_type_is('public', 'visit_sessions', 'session_date', 'date', 'session_date is a date');
select is(
  (select confdeltype from pg_constraint
   where conrelid = 'public.visit_sessions'::regclass and confrelid = 'public.session_templates'::regclass),
  'n'::"char",
  'deleting a template leaves its sessions in place (on delete set null)'
);
select ok(
  (select indexdef like '%WHERE (status = ''open''::session_status)%' from pg_indexes
   where schemaname = 'public' and indexname = 'visit_sessions_avail_idx'),
  'visit_sessions_avail_idx only covers open sessions'
);

insert into public.session_templates (id, rw_id, weekday, label, start_time, end_time, capacity)
values ('00000000-0000-4000-8000-0000000000a1', 5, 1, 'Sesi Pagi', '08:00', '10:00', 40);

select throws_ok(
  $$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
    values (5, 7, 'x', '08:00', '10:00', 40)$$,
  '23514', null, 'a template weekday is 0 (Sunday) to 6'
);
select throws_ok(
  $$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
    values (5, 2, 'x', '10:00', '10:00', 40)$$,
  '23514', null, 'a template ends after it starts'
);
select throws_ok(
  $$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
    values (5, 2, 'x', '08:00', '10:00', 2001)$$,
  '23514', null, 'a template capacity stays between 1 and 2000'
);
select throws_ok(
  $$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
    values (5, 1, 'Sesi Pagi lagi', '08:00', '11:00', 20)$$,
  '23505', null, 'one template per RW, weekday and start time'
);

insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, template_id)
values ('00000000-0000-4000-8000-0000000000b1', 5, '2026-11-12', '08:00', '10:00', 'Sesi Pagi', 10,
        '00000000-0000-4000-8000-0000000000a1');

select is(
  (select status from public.visit_sessions where id = '00000000-0000-4000-8000-0000000000b1'),
  'open'::public.session_status,
  'a new session starts open'
);
select throws_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity, reserved_pax)
    values (8, '2026-11-12', '13:00', '15:00', 'x', 10, 11)$$,
  '23514', null, 'a session is never created oversold'
);
select throws_ok(
  $$update public.visit_sessions set reserved_pax = 11 where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '23514', null, 'reserving past capacity is refused by the database itself'
);
select throws_ok(
  $$update public.visit_sessions set reserved_pax = -1 where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '23514', null, 'reserved_pax never goes negative'
);
select throws_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity)
    values (5, '2026-11-12', '08:00', '09:00', 'dobel', 10)$$,
  '23505', null, 'one session per RW, date and start time'
);
select lives_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity)
    values (8, '2026-11-12', '08:00', '10:00', 'Sesi Pagi RW 08', 10)$$,
  'another RW may use the same date and start time'
);
delete from public.session_templates where id = '00000000-0000-4000-8000-0000000000a1';
select is(
  (select template_id from public.visit_sessions where id = '00000000-0000-4000-8000-0000000000b1'),
  null,
  'the session survives its template, with template_id cleared'
);

-- ===== Catalogue (Task P1.2.05) =====

select columns_are('public', 'tour_packages', array[
  'id', 'rw_id', 'category', 'slug', 'name', 'tagline', 'description_md', 'highlights',
  'inclusions', 'itinerary', 'duration_minutes', 'pricing_basis', 'price_per_pax', 'flat_price',
  'min_pax', 'max_pax', 'image_paths', 'is_featured', 'status', 'sort_order', 'valid_from',
  'valid_to', 'created_by', 'updated_by', 'created_at', 'updated_at'
]);
select columns_are('public', 'tour_package_legs', array[
  'id', 'package_id', 'rw_id', 'leg_order', 'duration_minutes', 'notes'
]);
select columns_are('public', 'tour_package_price_tiers', array[
  'id', 'package_id', 'min_pax', 'max_pax', 'price_per_pax'
]);
select columns_are('public', 'package_price_history', array[
  'id', 'package_id', 'tier_id', 'changed_by', 'old_price_per_pax', 'new_price_per_pax',
  'old_flat_price', 'new_flat_price', 'reason', 'changed_at'
]);
select columns_are('public', 'umkm_vendors', array[
  'id', 'rw_id', 'slug', 'name', 'owner_name', 'phone', 'description_md', 'logo_path',
  'bank_name', 'bank_account_number', 'bank_account_holder', 'is_active', 'created_by',
  'created_at', 'updated_at'
]);
select columns_are('public', 'products_umkm', array[
  'id', 'rw_id', 'vendor_id', 'slug', 'name', 'category', 'description_md', 'price', 'unit_label',
  'min_order_qty', 'max_order_qty', 'lead_time_days', 'is_addon_eligible', 'is_available',
  'is_featured', 'image_paths', 'status', 'sort_order', 'created_by', 'created_at', 'updated_at'
]);
select has_index('public', 'tour_packages', 'tour_packages_public_idx', 'tour_packages has its public listing index');
select has_index('public', 'products_umkm', 'products_umkm_public_idx', 'products_umkm has its public listing index');
select has_index('public', 'package_price_history', 'package_price_history_pkg_idx', 'price history is indexed per package');

select throws_ok(
  $$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax)
    values (5, 'combo', 'combo-salah', 'x', 25000)$$,
  '23514', null, 'a combo package belongs to the kelurahan, not to one RW'
);
select throws_ok(
  $$insert into public.tour_packages (category, slug, name, price_per_pax)
    values ('regular', 'tanpa-rw', 'x', 25000)$$,
  '23514', null, 'a non-combo package needs its RW'
);
select throws_ok(
  $$insert into public.tour_packages (rw_id, category, slug, name)
    values (5, 'regular', 'tanpa-harga', 'x')$$,
  '23514', null, 'a per-pax package needs price_per_pax'
);
select throws_ok(
  $$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax, min_pax, max_pax)
    values (5, 'regular', 'pax-terbalik', 'x', 25000, 50, 10)$$,
  '23514', null, 'max_pax is never below min_pax'
);
select lives_ok(
  $$insert into public.tour_packages (category, slug, name, pricing_basis, flat_price)
    values ('combo', 'paket-kombinasi', 'Kombinasi', 'flat_group', 1500000)$$,
  'a flat-priced combo without RW is accepted'
);

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax)
values ('00000000-0000-4000-8000-0000000000c1', 5, 'regular', 'eduwisata-ecowastreme', 'Eduwisata', 25000);
insert into public.tour_package_legs (package_id, rw_id, leg_order)
values ('00000000-0000-4000-8000-0000000000c1', 5, 1);

select throws_ok(
  $$insert into public.tour_package_legs (package_id, rw_id, leg_order) values ('00000000-0000-4000-8000-0000000000c1', 5, 2)$$,
  '23505', null, 'a package visits each RW once'
);
select throws_ok(
  $$insert into public.tour_package_legs (package_id, rw_id, leg_order) values ('00000000-0000-4000-8000-0000000000c1', 8, 1)$$,
  '23505', null, 'leg order is unique within a package'
);
select throws_ok(
  $$insert into public.tour_package_legs (package_id, rw_id, leg_order) values ('00000000-0000-4000-8000-0000000000c1', 8, 0)$$,
  '23514', null, 'leg order starts at 1'
);

insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
values ('00000000-0000-4000-8000-0000000000c1', 1, 20, 25000);
select lives_ok(
  $$insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
    values ('00000000-0000-4000-8000-0000000000c1', 21, null, 20000)$$,
  'an adjacent open-ended tier is accepted'
);
select throws_ok(
  $$insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
    values ('00000000-0000-4000-8000-0000000000c1', 20, 30, 22000)$$,
  '23P01', null, 'tiers touching the same pax count are refused'
);
select throws_ok(
  $$insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
    values ('00000000-0000-4000-8000-0000000000c1', 500, 600, 15000)$$,
  '23P01', null, 'a tier inside an open-ended tier is refused'
);

insert into public.package_price_history (package_id, old_price_per_pax, new_price_per_pax)
values ('00000000-0000-4000-8000-0000000000c1', 20000, 25000);
select throws_ok(
  $$delete from public.tour_packages where id = '00000000-0000-4000-8000-0000000000c1'$$,
  '23503', null, 'a package with price history cannot be deleted'
);
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax)
values ('00000000-0000-4000-8000-0000000000c2', 8, 'regular', 'paket-uji-hapus', 'Uji', 30000);
insert into public.tour_package_legs (package_id, rw_id, leg_order)
values ('00000000-0000-4000-8000-0000000000c2', 8, 1);
delete from public.tour_packages where id = '00000000-0000-4000-8000-0000000000c2';
select is(
  (select count(*) from public.tour_package_legs where package_id = '00000000-0000-4000-8000-0000000000c2'),
  0::bigint,
  'deleting a draft package takes its legs with it'
);

insert into public.umkm_vendors (id, rw_id, slug, name)
values ('00000000-0000-4000-8000-0000000000d1', 5, 'pkk-rw-05', 'PKK RW 05');
select throws_ok(
  $$insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price, min_order_qty, max_order_qty)
    values (5, '00000000-0000-4000-8000-0000000000d1', 'kompos', 'Kompos', 'compost', 15000, 10, 5)$$,
  '23514', null, 'max_order_qty is never below min_order_qty'
);
select throws_ok(
  $$insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price)
    values (5, '00000000-0000-4000-8000-0000000000d1', 'kompos', 'Kompos', 'compost', -1)$$,
  '23514', null, 'a product price is never negative'
);

select * from finish();
rollback;
