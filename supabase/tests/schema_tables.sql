-- Structure test for 0003_tables, extended group by group: exact columns, the types other code
-- relies on, keys, and the CHECK / unique rules proven by trying to break them.
begin;
select plan(212);
-- Fixtures are dated relative to today, so the suite keeps passing as the calendar moves on. Only
-- next_document_number keeps fixed instants: it formats the moment it is given and never reads today.
create function pg_temp.days_from_today(p_days integer) returns date
  language sql stable
as $$ select public.today_jkt() + p_days; $$;
create function pg_temp.jakarta_time(p_days integer, p_time time) returns timestamptz
  language sql stable
as $$ select (public.today_jkt() + p_days + p_time) at time zone 'Asia/Jakarta'; $$;
grant execute on function pg_temp.days_from_today(integer), pg_temp.jakarta_time(integer, time) to public;
-- This file checks constraints and keys. The status fences of 0004 are tested in
-- schema_functions.sql; here the fixtures play the transition functions.
select set_config('app.in_rpc', '1', true);

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
  'claims_version', 'avatar_path', 'last_login_at', 'created_by', 'created_at', 'updated_at',
  -- added by 0004 for the delayed staff changes (MFA reset, promotion to superadmin)
  'mfa_reset_requested_at', 'mfa_reset_requested_by', 'promotion_requested_at', 'promotion_requested_by'
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
values ('00000000-0000-4000-8000-0000000000b1', 5, pg_temp.days_from_today(27), '08:00', '10:00', 'Sesi Pagi', 10,
        '00000000-0000-4000-8000-0000000000a1');

select is(
  (select status from public.visit_sessions where id = '00000000-0000-4000-8000-0000000000b1'),
  'open'::public.session_status,
  'a new session starts open'
);
select throws_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity, reserved_pax)
    values (8, pg_temp.days_from_today(27), '13:00', '15:00', 'x', 10, 11)$$,
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
    values (5, pg_temp.days_from_today(27), '08:00', '09:00', 'dobel', 10)$$,
  '23505', null, 'one session per RW, date and start time'
);
select lives_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity)
    values (8, pg_temp.days_from_today(27), '08:00', '10:00', 'Sesi Pagi RW 08', 10)$$,
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
  'old_flat_price', 'new_flat_price', 'reason', 'changed_at', 'old_pricing_basis', 'new_pricing_basis',
  'old_min_pax', 'new_min_pax', 'old_max_pax', 'new_max_pax'
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

-- Since 0004 the single leg of an RW package is written by tour_packages_single_leg.
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax)
values ('00000000-0000-4000-8000-0000000000c1', 5, 'regular', 'eduwisata-ecowastreme', 'Eduwisata', 25000);

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

-- ===== Booking engine (Task P1.2.06) =====

select columns_are('public', 'bookings', array[
  'id', 'booking_code', 'status', 'channel', 'package_id', 'package_snapshot', 'rw_ids',
  'booker_type', 'institution_name', 'pic_name', 'pic_phone', 'pic_email', 'pax_count',
  'visit_date', 'visit_date_end', 'notes', 'subtotal_package', 'subtotal_addons',
  'discount_amount', 'discount_note', 'total_amount', 'amount_paid', 'currency', 'expires_at',
  'quoted_at', 'paid_at', 'checked_in_at', 'completed_at', 'cancelled_at', 'cancelled_by',
  'cancel_reason', 'expired_at', 'refunded_at', 'needs_review', 'review_reason',
  'phone_verified_at', 'email_verified_at', 'consent_version', 'consented_at', 'token_version',
  'idempotency_key', 'ticket_pdf_path', 'admin_notes', 'created_by', 'source_ip', 'user_agent',
  'created_at', 'updated_at',
  -- added by 0004: anonymisation stamp and the stored masks the staff view reads
  'pii_purged_at', 'phone_masked', 'email_masked', 'pic_first_name'
]);
select columns_are('public', 'booking_legs', array[
  'id', 'booking_id', 'rw_id', 'visit_session_id', 'leg_order', 'pax_count', 'status',
  'quota_reserved_at', 'quota_released_at', 'checked_in_at'
]);
select columns_are('public', 'booking_addons', array[
  'id', 'booking_id', 'product_id', 'rw_id', 'vendor_id', 'product_name_snapshot', 'unit_price',
  'qty', 'line_total', 'notes', 'fulfillment_status', 'created_at', 'updated_at'
]);
select columns_are('public', 'booking_participants', array[
  'id', 'booking_id', 'seq_no', 'full_name', 'group_label', 'role_label', 'created_at',
  'updated_at'
]);
select columns_are('public', 'booking_events', array[
  'id', 'booking_id', 'from_status', 'to_status', 'actor_type', 'actor_id', 'reason', 'payload',
  'occurred_at'
]);
select columns_are('public', 'guest_otps', array[
  'id', 'purpose', 'phone', 'email', 'booking_id', 'code_hash', 'attempts', 'max_attempts',
  'expires_at', 'verified_at', 'consumed_at', 'ip', 'created_at'
]);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public'
     and indexname = any (array['bookings_status_expiry_idx', 'bookings_visit_date_idx', 'bookings_rw_ids_idx', 'bookings_pic_phone_idx', 'bookings_pic_email_idx', 'bookings_created_idx', 'bookings_search_idx', 'booking_legs_session_idx', 'booking_legs_rw_idx', 'booking_addons_rw_idx', 'booking_events_booking_idx', 'guest_otps_phone_idx'])),
  12,
  'every index of the booking group exists'
);

-- One valid booking; each check below breaks exactly one rule of it.
select lives_ok(
  $$insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at, idempotency_key)
    values ('00000000-0000-4000-8000-0000000000e1', 'GSK-7F3K9Q2M', 'quoted', '00000000-0000-4000-8000-0000000000c1',
      '{"name": "Eduwisata"}', '{5}', 'school', 'Siti Rahmawati', '+6281234567890', 'siti@example.test', 40,
      pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 1000000, 'v1', now(), 'wizard-1')$$,
  'a complete quoted booking is accepted'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2A', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 999000, 'v1', now())$$,
  '23514', null, 'the total must equal package + add-ons - discount'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2B', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(27), 0, 0, 'v1', now())$$,
  '23514', null, 'a booking is never free'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2C', 'pending_payment', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 1000000, 'v1', now())$$,
  '23514', null, 'a hold always has a deadline (expires_at)'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2D', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(26), 1000000, 1000000, 'v1', now())$$,
  '23514', null, 'the last visit date is never before the first'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-ILOU1234', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 1000000, 'v1', now())$$,
  '23514', null, 'booking codes use Crockford base32 (no I, L, O, U)'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at, currency)
    values ('GSK-7F3K9Q2E', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 1000000, 'v1', now(), 'USD')$$,
  '23514', null, 'bookings are always in IDR'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at, idempotency_key)
    values ('GSK-7F3K9Q2F', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 1000000, 'v1', now(), 'wizard-1')$$,
  '23505', null, 'the same wizard submission cannot create a second booking'
);

insert into public.booking_legs (id, booking_id, rw_id, visit_session_id, leg_order, pax_count)
values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e1', 5,
        '00000000-0000-4000-8000-0000000000b1', 1, 40);
select is(
  (select status from public.booking_legs where id = '00000000-0000-4000-8000-0000000000e2'),
  'unreserved'::public.booking_leg_status,
  'a new leg holds no quota yet'
);
select throws_ok(
  $$update public.booking_legs set status = 'reserved' where id = '00000000-0000-4000-8000-0000000000e2'$$,
  '23514', null, 'a reserved leg records when its quota was taken'
);
select throws_ok(
  $$insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count)
    values ('00000000-0000-4000-8000-0000000000e1', 5, '00000000-0000-4000-8000-0000000000b1', 2, 40)$$,
  '23505', null, 'a booking has one leg per RW'
);

insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price)
values ('00000000-0000-4000-8000-0000000000d2', 5, '00000000-0000-4000-8000-0000000000d1', 'keripik-daun', 'Keripik', 'snack', 10000);
insert into public.booking_addons (booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty, line_total)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2', 5,
        '00000000-0000-4000-8000-0000000000d1', 'Keripik', 10000, 3, 30000);
select throws_ok(
  $$update public.booking_addons set line_total = 25000 where booking_id = '00000000-0000-4000-8000-0000000000e1'$$,
  '23514', null, 'an add-on line total is always unit price x quantity'
);
select throws_ok(
  $$insert into public.booking_addons (booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty, line_total)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2', 5,
            '00000000-0000-4000-8000-0000000000d1', 'Keripik', 10000, 1, 10000)$$,
  '23505', null, 'a product appears once per booking (change the quantity instead)'
);

insert into public.booking_participants (booking_id, seq_no, full_name, group_label, role_label)
values ('00000000-0000-4000-8000-0000000000e1', 1, 'Budi Santoso', '5A', 'student');
select throws_ok(
  $$insert into public.booking_participants (booking_id, seq_no, full_name) values ('00000000-0000-4000-8000-0000000000e1', 2, 'B')$$,
  '23514', null, 'a participant name has at least 2 characters'
);
select throws_ok(
  $$insert into public.booking_participants (booking_id, seq_no, full_name, role_label)
    values ('00000000-0000-4000-8000-0000000000e1', 2, 'Ani Lestari', 'parent')$$,
  '23514', null, 'role_label is one of student, teacher, chaperone, participant'
);
select throws_ok(
  $$insert into public.booking_participants (booking_id, seq_no, full_name) values ('00000000-0000-4000-8000-0000000000e1', 1, 'Ani Lestari')$$,
  '23505', null, 'participant numbers are unique within a booking'
);
select throws_ok(
  $$insert into public.booking_events (booking_id, to_status, actor_type) values ('00000000-0000-4000-8000-0000000000e1', 'quoted', 'robot')$$,
  '23514', null, 'booking events name a known actor type'
);
select throws_ok(
  $$insert into public.guest_otps (purpose, code_hash, expires_at) values ('booking_phone', 'h', now() + interval '5 minutes')$$,
  '23514', null, 'an OTP is sent to a phone or an email'
);
select throws_ok(
  $$delete from public.bookings where id = '00000000-0000-4000-8000-0000000000e1'$$,
  '23503', null, 'a booking with legs, add-ons or participants is never deleted'
);

-- ===== Payments and B2B documents (Task P1.2.07, P1.2.08) =====

select columns_are('public', 'payments', array[
  'id', 'booking_id', 'attempt_no', 'provider', 'method', 'status', 'order_id', 'provider_txn_id',
  'gross_amount', 'snap_token', 'snap_redirect_url', 'payment_type_raw', 'va_bank', 'va_number',
  'transaction_time', 'settlement_time', 'expiry_time', 'fraud_status', 'status_code',
  'last_payload', 'manual_proof_path', 'manual_reference', 'recorded_by', 'refunded_amount',
  'created_at', 'updated_at'
]);
select columns_are('public', 'payment_events', array[
  'id', 'payment_id', 'order_id', 'source', 'event_hash', 'transaction_status', 'fraud_status',
  'status_code', 'gross_amount_raw', 'payload', 'received_at', 'processed_at', 'processing_result'
]);
select columns_are('public', 'webhook_rejections', array[
  'id', 'provider', 'reason', 'order_id', 'status_code', 'body_sha256', 'ip', 'user_agent',
  'received_at'
]);
select columns_are('public', 'payment_adjustments', array[
  'id', 'booking_id', 'payment_id', 'type', 'status', 'amount', 'reason', 'evidence_path',
  'proposed_by', 'proposed_at', 'approved_by', 'approved_at', 'rejected_reason',
  'apply_not_before', 'applied_at'
]);
select columns_are('public', 'reconciliation_runs', array[
  'id', 'run_date', 'source', 'started_at', 'finished_at', 'payments_checked', 'issues_found',
  'ledger_chain_ok', 'audit_chain_ok', 'summary', 'created_by'
]);
select columns_are('public', 'reconciliation_issues', array[
  'id', 'run_id', 'booking_id', 'payment_id', 'issue_type', 'severity', 'details', 'resolved_at',
  'resolved_by', 'resolution_note', 'created_at'
]);
select columns_are('public', 'quotations', array[
  'id', 'booking_id', 'quotation_number', 'verify_code', 'version', 'status', 'issued_at',
  'valid_until', 'snapshot', 'pdf_path', 'issued_by'
]);
select columns_are('public', 'invoices', array[
  'id', 'booking_id', 'invoice_number', 'status', 'issued_at', 'due_date', 'amount_due',
  'amount_paid', 'paid_at', 'payment_id', 'receipt_number', 'credit_note_number', 'snapshot',
  'pdf_path', 'receipt_pdf_path', 'credit_note_pdf_path', 'void_reason', 'voided_at', 'created_at',
  'updated_at'
]);
select columns_are('public', 'document_sequences', array[
  'kind', 'period', 'last_value'
]);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public'
     and indexname = any (array['payments_booking_idx', 'payments_one_open_per_booking', 'payment_events_order_idx', 'webhook_rejections_time_idx', 'payment_adjustments_status_idx', 'reconciliation_issues_open_idx', 'invoices_one_live_per_booking'])),
  7,
  'every index of the payments and b2b documents group exists'
);

insert into public.payments (id, booking_id, attempt_no, provider, order_id, gross_amount)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'midtrans',
        'GSK-7F3K9Q2M-01', 1000000);
select throws_ok(
  $$insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount)
    values ('00000000-0000-4000-8000-0000000000e1', 2, 'midtrans', 'GSK-7F3K9Q2M-02', 1000000)$$,
  '23505', null, 'a second payment cannot open while the first is initiated'
);
update public.payments set status = 'needs_review' where id = '00000000-0000-4000-8000-0000000000f1';
select throws_ok(
  $$insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount)
    values ('00000000-0000-4000-8000-0000000000e1', 2, 'midtrans', 'GSK-7F3K9Q2M-02', 1000000)$$,
  '23505', null, 'a payment under review also blocks a new attempt'
);
update public.payments set status = 'failed' where id = '00000000-0000-4000-8000-0000000000f1';
select lives_ok(
  $$insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount)
    values ('00000000-0000-4000-8000-0000000000e1', 2, 'midtrans', 'GSK-7F3K9Q2M-02', 1000000)$$,
  'after a failed attempt the next one may open'
);
select throws_ok(
  $$insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount, status)
    values ('00000000-0000-4000-8000-0000000000e1', 2, 'midtrans', 'GSK-7F3K9Q2M-03', 1000000, 'failed')$$,
  '23505', null, 'attempt numbers are unique per booking'
);
select throws_ok(
  $$insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount, status)
    values ('00000000-0000-4000-8000-0000000000e1', 3, 'midtrans', 'GSK-7F3K9Q2M-3', 1000000, 'failed')$$,
  '23514', null, 'an order id is the booking code plus a two-digit attempt'
);
select throws_ok(
  $$insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount, status)
    values ('00000000-0000-4000-8000-0000000000e1', 3, 'midtrans', 'GSK-7F3K9Q2M-03', 0, 'failed')$$,
  '23514', null, 'a payment is never for zero rupiah'
);

insert into public.payment_events (order_id, source, event_hash, payload)
values ('GSK-7F3K9Q2M-01', 'webhook', 'hash-of-body-1', '{}');
select throws_ok(
  $$insert into public.payment_events (order_id, source, event_hash, payload) values ('GSK-7F3K9Q2M-01', 'webhook', 'hash-of-body-1', '{}')$$,
  '23505', null, 'the same notification body is stored once (replays become no-ops)'
);
select throws_ok(
  $$insert into public.payment_events (order_id, source, event_hash, payload) values ('GSK-7F3K9Q2M-01', 'browser', 'hash-of-body-2', '{}')$$,
  '23514', null, 'payment events only come from webhook, status API, poll or manual'
);
select throws_ok(
  $$insert into public.webhook_rejections (provider, reason) values ('midtrans', 'looked_odd')$$,
  '23514', null, 'webhook rejections use a known reason'
);

select throws_ok(
  $$insert into public.payment_adjustments (booking_id, type, amount, reason, evidence_path, proposed_by, approved_by)
    values ('00000000-0000-4000-8000-0000000000e1', 'manual_refund', 100000, 'Refund karena hujan deras',
            'documents/x.pdf', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a superadmin approving their own adjustment needs the 24 h delay'
);
select lives_ok(
  $$insert into public.payment_adjustments (booking_id, type, amount, reason, evidence_path, proposed_by, approved_by, apply_not_before)
    values ('00000000-0000-4000-8000-0000000000e1', 'manual_refund', 100000, 'Refund karena hujan deras',
            'documents/x.pdf', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() + interval '24 hours')$$,
  'self-approval with the 24 h delay is accepted'
);
select throws_ok(
  $$insert into public.payment_adjustments (booking_id, type, amount, reason, evidence_path, proposed_by)
    values ('00000000-0000-4000-8000-0000000000e1', 'write_off', 100000, 'singkat', 'documents/x.pdf', '00000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'an adjustment reason has at least 10 characters'
);

insert into public.reconciliation_runs (id, run_date, source) values ('00000000-0000-4000-8000-000000000101', pg_temp.days_from_today(27), 'nightly');
select throws_ok(
  $$insert into public.reconciliation_issues (run_id, issue_type, severity)
    values ('00000000-0000-4000-8000-000000000101', 'something_else', 'high')$$,
  '23514', null, 'reconciliation issues use a known type'
);

-- Since 0004, quotations_limit_guard wants a verified phone first.
update public.bookings set phone_verified_at = now() where id = '00000000-0000-4000-8000-0000000000e1';
insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot)
values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0001', 'ABCDEFGH12', pg_temp.days_from_today(16), '{}');
select throws_ok(
  $$insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot)
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0002', 'ABCDEFGH13', pg_temp.days_from_today(16), '{}')$$,
  '23505', null, 'each quotation version exists once per booking'
);
select throws_ok(
  $$insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot, version)
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0003', 'ABCDEFGH14', pg_temp.days_from_today(16), '{}', 4)$$,
  '23514', null, 'a booking has at most three quotation versions'
);

insert into public.invoices (id, booking_id, invoice_number, amount_due, snapshot)
values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000e1', 'INV/GSK/2026/10/0001', 1000000, '{}');
select throws_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-0000000000e1', 'INV/GSK/2026/10/0002', 1000000, '{}')$$,
  '23505', null, 'a booking has one live invoice'
);
update public.invoices set status = 'void', voided_at = now() where id = '00000000-0000-4000-8000-000000000102';
select lives_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-0000000000e1', 'INV/GSK/2026/10/0002', 1000000, '{}')$$,
  'a voided invoice can be replaced'
);

select throws_ok(
  $$insert into public.document_sequences (kind, period) values ('invoice', '2026/10')$$,
  '23514', null, 'a numbering period is YYYY or YYYY-MM'
);
insert into public.document_sequences (kind, period) values ('invoice', '2026-10');
select throws_ok(
  $$insert into public.document_sequences (kind, period) values ('invoice', '2026-10')$$,
  '23505', null, 'one counter per document kind and period'
);

-- ===== Tickets, check-in and certificates (Task P1.2.09, P1.2.08) =====

select columns_are('public', 'tickets_qr', array[
  'id', 'booking_id', 'booking_leg_id', 'rw_id', 'visit_session_id', 'ticket_code', 'status',
  'valid_on', 'valid_from', 'valid_until', 'pax_count', 'key_id', 'issued_at', 'checked_in_at',
  'checked_in_pax', 'unpaid_pax', 'checked_in_by', 'check_in_note', 'suspended_at',
  'suspend_reason', 'revoked_at', 'revoked_by', 'revoke_reason', 'updated_at'
]);
select columns_are('public', 'ticket_scans', array[
  'id', 'attempt_id', 'ticket_id', 'rw_id', 'scanned_by', 'phase', 'result', 'source',
  'attendee_count', 'override_reason', 'raw_payload', 'device_info', 'ip', 'scanned_at'
]);
select columns_are('public', 'certificates', array[
  'id', 'booking_id', 'participant_id', 'kind', 'certificate_number', 'verify_code', 'status',
  'recipient_name', 'institution_name', 'visit_date', 'rw_ids', 'template_version', 'pdf_path',
  'rendered_at', 'released_at', 'release_waived_by', 'issued_at', 'issued_by', 'revoked_at',
  'revoke_reason', 'purged_at'
]);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public'
     and indexname = any (array['tickets_qr_gate_idx', 'tickets_qr_booking_idx', 'ticket_scans_rw_time_idx', 'ticket_scans_ticket_idx', 'certificates_group_once', 'certificates_participant_once'])),
  6,
  'every index of the tickets, check-in and certificates group exists'
);

-- Since 0004 a ticket needs a paid booking with a settled payment behind it.
update public.payments set status = 'settled', settlement_time = now() where order_id = 'GSK-7F3K9Q2M-02';
-- A booking reaches paid only through pending_payment (docs/PRD.md §9.2).
update public.bookings set status = 'pending_payment', expires_at = now() + interval '2 hours'
where id = '00000000-0000-4000-8000-0000000000e1';
update public.bookings set status = 'paid', paid_at = now(), amount_paid = 1000000 where id = '00000000-0000-4000-8000-0000000000e1';
insert into public.tickets_qr (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
  valid_from, valid_until, pax_count, key_id)
values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000e1',
        '00000000-0000-4000-8000-0000000000e2', 5, '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2M-05',
        pg_temp.days_from_today(27), pg_temp.jakarta_time(27, '00:00'), pg_temp.jakarta_time(27, '12:00'), 40, 'k1');
select is(
  (select status from public.tickets_qr where id = '00000000-0000-4000-8000-000000000201'),
  'issued'::public.ticket_status,
  'a new ticket starts issued'
);
select throws_ok(
  $$insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
      valid_from, valid_until, pax_count, key_id)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', 5,
            '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2M-06', pg_temp.days_from_today(27),
            pg_temp.jakarta_time(27, '00:00'), pg_temp.jakarta_time(27, '12:00'), 40, 'k1')$$,
  '23505', null, 'one ticket per booking leg'
);
-- The code is checked on insert; 0004 makes it immutable afterwards, so the format test uses a
-- second leg.
insert into public.booking_legs (id, booking_id, rw_id, visit_session_id, leg_order, pax_count)
select '00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000e1', 8, s.id, 2, 40
from public.visit_sessions s where s.rw_id = 8 limit 1;
select throws_ok(
  $$insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
      valid_from, valid_until, pax_count, key_id)
    select '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e3', 8, s.id,
           'GSK-7F3K9Q2M-8', pg_temp.days_from_today(27), pg_temp.jakarta_time(27, '00:00'), pg_temp.jakarta_time(27, '12:00'), 40, 'k1'
    from public.visit_sessions s where s.rw_id = 8 limit 1$$,
  '23514', null, 'a ticket code is the booking code plus the two-digit RW'
);
select throws_ok(
  $$update public.tickets_qr set valid_until = valid_from where id = '00000000-0000-4000-8000-000000000201'$$,
  '23514', null, 'the check-in window closes after it opens'
);
select throws_ok(
  $$update public.tickets_qr set unpaid_pax = -1 where id = '00000000-0000-4000-8000-000000000201'$$,
  '23514', null, 'unpaid_pax never goes negative'
);

insert into public.ticket_scans (attempt_id, ticket_id, rw_id, scanned_by, phase, result)
values ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 5,
        '00000000-0000-4000-8000-000000000002', 'validate', 'ok');
select throws_ok(
  $$insert into public.ticket_scans (attempt_id, ticket_id, rw_id, scanned_by, phase, result)
    values ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 5,
            '00000000-0000-4000-8000-000000000002', 'check_in', 'ok')$$,
  '23505', null, 'a retried scan attempt cannot be recorded twice'
);
select throws_ok(
  $$insert into public.ticket_scans (attempt_id, scanned_by, phase, result, raw_payload)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'validate', 'invalid_signature', repeat('x', 129))$$,
  '23514', null, 'only the first 128 characters of a scanned payload are kept'
);
select throws_ok(
  $$insert into public.ticket_scans (attempt_id, scanned_by, phase, result, source)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'validate', 'ok', 'nfc')$$,
  '23514', null, 'scans come from QR, manual or manual backfill'
);

insert into public.certificates (booking_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
values ('00000000-0000-4000-8000-0000000000e1', 'group', 'SERT/GSK/2026/00001', 'CERTGROUP1', 'SD Negeri Gisikdrono 01', pg_temp.days_from_today(27), '{5}');
select throws_ok(
  $$insert into public.certificates (booking_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
    values ('00000000-0000-4000-8000-0000000000e1', 'group', 'SERT/GSK/2026/00002', 'CERTGROUP2', 'x', pg_temp.days_from_today(27), '{5}')$$,
  '23505', null, 'a booking gets one group certificate'
);
select throws_ok(
  $$insert into public.certificates (booking_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
    values ('00000000-0000-4000-8000-0000000000e1', 'participant', 'SERT/GSK/2026/00003', 'CERTPART01', 'x', pg_temp.days_from_today(27), '{5}')$$,
  '23514', null, 'a participant certificate names its participant'
);
insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
select '00000000-0000-4000-8000-0000000000e1', id, 'participant', 'SERT/GSK/2026/00004', 'CERTPART02', full_name, pg_temp.days_from_today(27), '{5}'
from public.booking_participants where booking_id = '00000000-0000-4000-8000-0000000000e1' and seq_no = 1;
select throws_ok(
  $$insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
    select '00000000-0000-4000-8000-0000000000e1', id, 'participant', 'SERT/GSK/2026/00005', 'CERTPART03', full_name, pg_temp.days_from_today(27), '{5}'
    from public.booking_participants where booking_id = '00000000-0000-4000-8000-0000000000e1' and seq_no = 1$$,
  '23505', null, 'a participant gets one certificate'
);
select throws_ok(
  $$delete from public.booking_participants where booking_id = '00000000-0000-4000-8000-0000000000e1' and seq_no = 1$$,
  '23514', null, 'a participant with a certificate is only removed through the purge, which marks the certificate first'
);
update public.certificates set purged_at = now(), recipient_name = '[dihapus]' where verify_code = 'CERTPART02';
select lives_ok(
  $$delete from public.booking_participants where booking_id = '00000000-0000-4000-8000-0000000000e1' and seq_no = 1$$,
  'after the purge marks the certificate, the participant row can go and the certificate stays'
);

-- ===== Content and community (Task P1.2.10) =====

select columns_are('public', 'galleries', array[
  'id', 'rw_id', 'category', 'media_type', 'storage_path', 'thumbnail_path', 'video_url', 'width',
  'height', 'blurhash', 'caption', 'alt_text', 'taken_at', 'booking_id', 'tags', 'status',
  'sort_order', 'uploaded_by', 'created_at', 'updated_at'
]);
select columns_are('public', 'articles', array[
  'id', 'rw_id', 'slug', 'title', 'excerpt', 'body_json', 'cover_path', 'category', 'tags',
  'status', 'author_id', 'reviewed_by', 'published_at', 'seo_title', 'seo_description',
  'reading_minutes', 'created_at', 'updated_at'
]);
select columns_are('public', 'booklets', array[
  'id', 'rw_id', 'kind', 'slug', 'title', 'description', 'pdf_path', 'cover_path',
  'page_images_prefix', 'page_count', 'file_size_bytes', 'download_count', 'status',
  'published_at', 'created_by', 'created_at', 'updated_at'
]);
select columns_are('public', 'hero_banners', array[
  'id', 'title', 'subtitle', 'cta_label', 'cta_href', 'image_path', 'mobile_image_path',
  'product_id', 'sort_order', 'is_active', 'starts_at', 'ends_at', 'created_by', 'created_at',
  'updated_at'
]);
select columns_are('public', 'activity_points', array[
  'id', 'rw_id', 'slug', 'name', 'point_type', 'short_description', 'body_md', 'image_path',
  'map_x', 'map_y', 'svg_hotspot_id', 'lat', 'lng', 'sort_order', 'status', 'created_at',
  'updated_at'
]);
select columns_are('public', 'performance_schedules', array[
  'id', 'rw_id', 'title', 'schedule_type', 'description_md', 'starts_at', 'ends_at', 'venue',
  'recurrence_rule', 'image_path', 'package_id', 'status', 'created_by', 'created_at',
  'updated_at'
]);
select columns_are('public', 'reviews', array[
  'id', 'booking_id', 'rw_ids', 'rating', 'title', 'body', 'reviewer_name', 'institution_name',
  'is_anonymous', 'status', 'is_featured', 'moderated_by', 'moderated_at', 'moderation_note',
  'created_at', 'updated_at',
  -- added by 0004: what v_public_reviews shows of the author
  'public_reviewer_name'
]);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public'
     and indexname = any (array['galleries_filter_idx', 'articles_public_idx', 'performance_schedules_time_idx', 'reviews_public_idx'])),
  4,
  'every index of the content and community group exists'
);

select throws_ok(
  $$insert into public.galleries (rw_id, category, storage_path, alt_text) values (5, 'activity', 'rw-05/gallery/a.webp', 'ab')$$,
  '23514', null, 'every gallery image has a real alt text (at least 3 characters)'
);
select throws_ok(
  $$insert into public.galleries (rw_id, category, media_type, storage_path, video_url, alt_text)
    values (5, 'event', 'video', 'rw-05/gallery/v.webp', 'https://evil.test/video', 'Tari tradisional')$$,
  '23514', null, 'video links point to YouTube only'
);
select throws_ok(
  $$insert into public.articles (slug, title) values ('judul-panjang', repeat('a', 161))$$,
  '23514', null, 'an article title stays within 160 characters'
);
select throws_ok(
  $$insert into public.articles (slug, title, seo_title) values ('seo-panjang', 'Judul', repeat('a', 71))$$,
  '23514', null, 'an SEO title stays within 70 characters'
);
insert into public.articles (id, slug, title) values ('00000000-0000-4000-8000-000000000401', 'artikel-baru', 'Artikel baru');
select is(
  (select body_json from public.articles where id = '00000000-0000-4000-8000-000000000401'),
  '{"type": "doc", "content": []}'::jsonb,
  'a new article starts as an empty ProseMirror document, never HTML'
);
select throws_ok(
  $$insert into public.hero_banners (title, image_path, cta_href) values ('Promo', 'kelurahan/hero.webp', '//evil.test')$$,
  '23514', null, 'a banner link cannot be protocol-relative'
);
select throws_ok(
  $$insert into public.hero_banners (title, image_path, cta_href) values ('Promo', 'kelurahan/hero.webp', 'https://evil.test')$$,
  '23514', null, 'a banner link cannot leave the site'
);
select throws_ok(
  $$insert into public.hero_banners (title, image_path, cta_href) values ('Promo', 'kelurahan/hero.webp', '/\evil.test')$$,
  '23514', null, 'a banner link cannot use the backslash trick'
);
select lives_ok(
  $$insert into public.hero_banners (title, image_path, cta_href) values ('Paket baru', 'kelurahan/hero.webp', '/paket-wisata')$$,
  'a banner may link to a path on this site'
);
select throws_ok(
  $$insert into public.activity_points (rw_id, slug, name, point_type, map_x) values (5, 'bank-sampah', 'Bank Sampah', 'bank_sampah', 101)$$,
  '23514', null, 'floor-plan coordinates are percentages from 0 to 100'
);
select throws_ok(
  $$insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at)
    values (8, 'Tari', 'dance_performance', pg_temp.jakarta_time(27, '09:00'), pg_temp.jakarta_time(27, '09:00'))$$,
  '23514', null, 'a performance ends after it starts'
);
select throws_ok(
  $$insert into public.reviews (booking_id, rw_ids, rating, body, reviewer_name) values ('00000000-0000-4000-8000-0000000000e1', '{5}', 6, 'Kunjungan yang seru sekali', 'Siti')$$,
  '23514', null, 'a rating is 1 to 5 stars'
);
select throws_ok(
  $$insert into public.reviews (booking_id, rw_ids, rating, body, reviewer_name) values ('00000000-0000-4000-8000-0000000000e1', '{5}', 5, 'Seru', 'Siti')$$,
  '23514', null, 'a review says at least 10 characters'
);
insert into public.reviews (booking_id, rw_ids, rating, body, reviewer_name)
values ('00000000-0000-4000-8000-0000000000e1', '{5}', 5, 'Kunjungan yang seru sekali', 'Siti');
select throws_ok(
  $$insert into public.reviews (booking_id, rw_ids, rating, body, reviewer_name) values ('00000000-0000-4000-8000-0000000000e1', '{5}', 4, 'Ulasan kedua untuk booking yang sama', 'Siti')$$,
  '23505', null, 'a booking leaves one review'
);
select is(
  (select status from public.reviews where booking_id = '00000000-0000-4000-8000-0000000000e1'),
  'pending'::public.review_status,
  'a new review waits for moderation'
);

-- ===== Revenue share and payouts (Task P1.2.11) =====

select columns_are('public', 'revenue_share_rules', array[
  'id', 'scope', 'rw_id', 'package_id', 'product_id', 'name', 'effective_from', 'effective_to',
  'is_active', 'created_by', 'created_at', 'updated_at'
]);
select columns_are('public', 'revenue_share_rule_lines', array[
  'id', 'rule_id', 'beneficiary', 'rw_id', 'vendor_id', 'pct'
]);
select columns_are('public', 'payout_batches', array[
  'id', 'beneficiary_key', 'period_from', 'period_to', 'total_amount', 'paid_at', 'reference',
  'proof_path', 'notes', 'created_by', 'created_at'
]);
select columns_are('public', 'revenue_share_entries', array[
  'id', 'booking_id', 'payment_id', 'adjustment_id', 'entry_type', 'line_ref', 'booking_addon_id',
  'rule_id', 'rule_version', 'beneficiary', 'beneficiary_key', 'rw_id', 'vendor_id', 'base_amount',
  'pct', 'amount', 'payout_batch_id', 'prev_hash', 'entry_hash', 'created_at'
]);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public'
     and indexname = any (array['revenue_entries_settlement_once', 'revenue_entries_beneficiary_idx', 'revenue_entries_payout_idx'])),
  3,
  'every index of the revenue share and payouts group exists'
);

select throws_ok(
  $$insert into public.revenue_share_rules (scope, name) values ('package', 'Paket tanpa paket')$$,
  '23514', null, 'a package rule names its package'
);
select throws_ok(
  $$insert into public.revenue_share_rules (scope, package_id, name)
    values ('package_default', '00000000-0000-4000-8000-0000000000c1', 'Default dengan paket')$$,
  '23514', null, 'a default rule is not tied to one package'
);
select throws_ok(
  $$insert into public.revenue_share_rules (scope, rw_id, name, effective_from, effective_to)
    values ('package_default', 5, 'Mundur', pg_temp.days_from_today(16), pg_temp.days_from_today(-14))$$,
  '23514', null, 'a rule period never ends before it starts'
);

insert into public.revenue_share_rules (id, scope, rw_id, name)
values ('00000000-0000-4000-8000-000000000501', 'package_default', 5, 'Default RW 05');
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
    values ('00000000-0000-4000-8000-000000000501', 'kelurahan', 5, 20)$$,
  '23514', null, 'the kelurahan share is not tied to an RW'
);
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, pct)
    values ('00000000-0000-4000-8000-000000000501', 'rw_treasury', 80)$$,
  '23514', null, 'an RW treasury share names its RW'
);
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, pct)
    values ('00000000-0000-4000-8000-000000000501', 'kelurahan', 100.01)$$,
  '23514', null, 'a share is at most 100 %'
);

select throws_ok(
  $$insert into public.payout_batches (beneficiary_key, period_from, period_to, total_amount, created_by)
    values ('rw:5', pg_temp.days_from_today(45), pg_temp.days_from_today(16), 800000, '00000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a payout period never ends before it starts'
);

insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
  rw_id, base_amount, pct, amount, entry_hash)
values ('00000000-0000-4000-8000-0000000000e1', 'settlement', 'package', '{}', 'rw_treasury', 'rw:5',
        5, 1000000, 80, 800000, 'hash-entry-1');
select throws_ok(
  $$insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
      rw_id, base_amount, pct, amount, entry_hash)
    values ('00000000-0000-4000-8000-0000000000e1', 'settlement', 'package', '{}', 'rw_treasury', 'rw:5',
            5, 1000000, 80, 800000, 'hash-entry-2')$$,
  '23505', null, 'a booking line is settled to a beneficiary once'
);
select lives_ok(
  $$insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
      rw_id, base_amount, pct, amount, entry_hash)
    values ('00000000-0000-4000-8000-0000000000e1', 'reversal', 'package', '{}', 'rw_treasury', 'rw:5',
            5, 1000000, 80, -800000, 'hash-entry-3')$$,
  'a refund adds a negative reversal row instead of editing the settlement'
);
select throws_ok(
  $$insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
      base_amount, pct, amount, entry_hash)
    values ('00000000-0000-4000-8000-0000000000e1', 'settlement', 'addon:x', '{}', 'kelurahan', 'kelurahan',
            1000000, 20, -200000, 'hash-entry-4')$$,
  '23514', null, 'a settlement row is never negative'
);
select throws_ok(
  $$insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
      base_amount, pct, amount, entry_hash)
    values ('00000000-0000-4000-8000-0000000000e1', 'reversal', 'addon:x', '{}', 'kelurahan', 'kelurahan',
            1000000, 20, 200000, 'hash-entry-5')$$,
  '23514', null, 'a reversal row is never positive'
);
select throws_ok(
  $$insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
      base_amount, pct, amount, entry_hash)
    values ('00000000-0000-4000-8000-0000000000e1', 'adjustment', 'package', '{}', 'kelurahan', 'kelurahan',
            1000000, 20, 5000, 'hash-entry-6')$$,
  '23514', null, 'an adjustment row points at its approved adjustment'
);
select col_is_unique('public', 'revenue_share_entries', 'entry_hash', 'every ledger row has its own chain hash');

-- ===== Messaging, security, audit and infrastructure (Task P1.2.12) =====

select columns_are('public', 'notifications', array[
  'id', 'booking_id', 'channel', 'template', 'recipient', 'recipient_name', 'params',
  'document_path', 'dedupe_key', 'status', 'attempts', 'max_attempts', 'next_attempt_at',
  'locked_at', 'last_error_code', 'last_error', 'dead_at', 'provider_message_id',
  'provider_status', 'sent_at', 'delivered_at', 'read_at', 'created_at', 'updated_at'
]);
select columns_are('public', 'security_events', array[
  'id', 'event_type', 'severity', 'actor_id', 'actor_role', 'ip_hash', 'user_agent', 'rw_id',
  'entity_type', 'entity_id', 'fingerprint', 'details', 'occurred_at'
]);
select columns_are('public', 'security_alerts', array[
  'id', 'rule', 'severity', 'fingerprint', 'title', 'details', 'first_seen_at', 'last_seen_at',
  'occurrences', 'notified_at', 'acknowledged_by', 'acknowledged_at', 'created_at'
]);
select columns_are('public', 'exports', array[
  'id', 'kind', 'format', 'requested_by', 'rw_id', 'filters', 'reason', 'row_count',
  'storage_path', 'watermark', 'expires_at', 'downloaded_at', 'deleted_at', 'created_at'
]);
select columns_are('public', 'dsr_requests', array[
  'id', 'request_type', 'phone', 'email', 'booking_code', 'message', 'otp_id', 'verified_at',
  'status', 'due_at', 'handled_by', 'handled_at', 'resolution_note', 'created_at'
]);
select columns_are('public', 'audit_logs', array[
  'id', 'occurred_at', 'actor_id', 'actor_role', 'actor_ip', 'request_id', 'action', 'entity_type',
  'entity_id', 'rw_id', 'before', 'after', 'metadata', 'prev_hash', 'entry_hash'
]);
select columns_are('public', 'login_attempts', array[
  'id', 'user_id', 'email_hash', 'ip', 'success', 'reason', 'attempted_at'
]);
select columns_are('public', 'rate_limit_buckets', array[
  'key', 'window_start', 'count'
]);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public'
     and indexname = any (array['notifications_queue_idx', 'notifications_provider_idx', 'notifications_booking_idx', 'security_events_type_time_idx', 'security_alerts_open_fingerprint', 'exports_user_time_idx', 'audit_logs_entity_idx', 'audit_logs_actor_idx', 'login_attempts_user_time_idx'])),
  9,
  'every index of the messaging, security, audit and infrastructure group exists'
);

insert into public.notifications (id, booking_id, channel, template, recipient, dedupe_key)
values ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-0000000000e1', 'whatsapp',
        'payment_received_ticket', '+6281234567890',
        'booking:00000000-0000-4000-8000-0000000000e1:payment_received_ticket:whatsapp');
select is(
  (select status::text || '/' || max_attempts::text from public.notifications where id = '00000000-0000-4000-8000-000000000601'),
  'queued/8',
  'a new notification is queued with 8 attempts'
);
select throws_ok(
  $$insert into public.notifications (booking_id, channel, template, recipient, dedupe_key)
    values ('00000000-0000-4000-8000-0000000000e1', 'whatsapp', 'payment_received_ticket', '+6281234567890',
            'booking:00000000-0000-4000-8000-0000000000e1:payment_received_ticket:whatsapp')$$,
  '23505', null, 'the same message is never queued twice (dedupe_key)'
);

select throws_ok(
  $$insert into public.security_events (event_type) values ('something_happened')$$,
  '23514', null, 'security events use one of the 25 known types'
);
select lives_ok(
  $$insert into public.security_events (event_type, severity, ip_hash) values ('quota_pressure', 'medium', 'hmac-of-ip')$$,
  'quota_pressure is a known security event type'
);

insert into public.security_alerts (rule, severity, fingerprint, title)
values ('login_lockout_spike', 'high', 'fp-1', 'Lonjakan akun terkunci');
select throws_ok(
  $$insert into public.security_alerts (rule, severity, fingerprint, title) values ('login_lockout_spike', 'high', 'fp-1', 'Lagi')$$,
  '23505', null, 'one open alert per fingerprint (repeats count up instead)'
);
update public.security_alerts set acknowledged_at = now(), acknowledged_by = '00000000-0000-4000-8000-000000000001'
where fingerprint = 'fp-1';
select lives_ok(
  $$insert into public.security_alerts (rule, severity, fingerprint, title) values ('login_lockout_spike', 'high', 'fp-1', 'Lagi')$$,
  'after acknowledging, the same fingerprint can alert again'
);

select throws_ok(
  $$insert into public.exports (kind, format, requested_by, watermark, expires_at)
    values ('visits', 'docx', '00000000-0000-4000-8000-000000000001', 'Diekspor oleh Super Admin', now() + interval '24 hours')$$,
  '23514', null, 'exports are xlsx, csv or pdf'
);
select throws_ok(
  $$insert into public.dsr_requests (request_type, due_at) values ('access', now() + interval '3 days')$$,
  '23514', null, 'a data request comes with a phone or an email to answer'
);
select throws_ok(
  $$insert into public.dsr_requests (request_type, email, due_at) values ('sell_my_data', 'x@example.test', now() + interval '3 days')$$,
  '23514', null, 'a data request uses one of the UU PDP request types'
);

select throws_ok(
  $$insert into public.audit_logs (actor_role, action, entity_type, entry_hash) values ('superadmin', 'bookings.update', 'bookings', 'audit-1')$$,
  '23514', null, 'a staff action in the audit log always names its actor'
);
select lives_ok(
  $$insert into public.audit_logs (actor_role, action, entity_type, entry_hash) values ('cron', 'purge_run', 'booking_participants', 'audit-2')$$,
  'a cron action may have no actor'
);
select col_is_unique('public', 'audit_logs', 'entry_hash', 'every audit row has its own chain hash');

select throws_ok(
  $$insert into public.login_attempts (email_hash, success, reason) values ('hmac-of-email', false, 'typo')$$,
  '23514', null, 'login attempts use a known reason'
);
insert into public.rate_limit_buckets (key, window_start, count) values ('otp:phone:abc', pg_temp.jakarta_time(27, '09:00'), 1);
select throws_ok(
  $$insert into public.rate_limit_buckets (key, window_start, count) values ('otp:phone:abc', pg_temp.jakarta_time(27, '09:00'), 1)$$,
  '23505', null, 'one counter per key and window'
);

-- ===== Cross-cutting (Task P1.2.13) =====

select tables_are(
  'public',
  array['rw_units', 'profiles', 'staff_invites', 'site_settings', 'session_templates', 'visit_sessions', 'tour_packages', 'tour_package_legs', 'tour_package_price_tiers', 'umkm_vendors', 'products_umkm', 'package_price_history', 'bookings', 'booking_legs', 'booking_addons', 'booking_participants', 'booking_events', 'guest_otps', 'payments', 'payment_events', 'webhook_rejections', 'payment_adjustments', 'reconciliation_runs', 'reconciliation_issues', 'quotations', 'invoices', 'document_sequences', 'certificates', 'tickets_qr', 'ticket_scans', 'galleries', 'articles', 'booklets', 'hero_banners', 'activity_points', 'performance_schedules', 'reviews', 'revenue_share_rules', 'revenue_share_rule_lines', 'revenue_share_entries', 'payout_batches', 'notifications', 'security_events', 'security_alerts', 'exports', 'dsr_requests', 'audit_logs', 'login_attempts', 'rate_limit_buckets'],
  'public holds exactly the 49 tables of the CLAUDE.md A.1 registry'
);

-- docs/PRD.md §8.1: money and operational rows are never deleted through a parent. Only these
-- catalogue, rule and media links may cascade (c) or clear themselves (n); everything else refuses.
select is(
  array(
    select c.conrelid::regclass::text || '.' || a.attname || ':' || c.confdeltype::text
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confdeltype not in ('a', 'r')
    order by 1
  ),
  array[
    'certificates.participant_id:n', 'dsr_requests.otp_id:n', 'galleries.booking_id:n',
    'hero_banners.product_id:n', 'package_price_history.tier_id:n', 'performance_schedules.package_id:n',
    'revenue_share_rule_lines.rule_id:c', 'revenue_share_rules.package_id:c', 'revenue_share_rules.product_id:c',
    'tour_package_legs.package_id:c', 'tour_package_price_tiers.package_id:c', 'visit_sessions.template_id:n'
  ],
  'only the PRD catalogue, rule and media links cascade or set null; every other reference refuses deletes'
);

select * from finish();
rollback;
