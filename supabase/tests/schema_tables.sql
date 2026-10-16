-- Structure test for 0003_tables, extended group by group: exact columns, the types other code
-- relies on, keys, and the CHECK / unique rules proven by trying to break them.
begin;
select plan(146);

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
  'created_at', 'updated_at'
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
      '2026-11-12', '2026-11-12', 1000000, 1000000, 'v1', now(), 'wizard-1')$$,
  'a complete quoted booking is accepted'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2A', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, '2026-11-12', '2026-11-12', 1000000, 999000, 'v1', now())$$,
  '23514', null, 'the total must equal package + add-ons - discount'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2B', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, '2026-11-12', '2026-11-12', 0, 0, 'v1', now())$$,
  '23514', null, 'a booking is never free'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2C', 'pending_payment', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, '2026-11-12', '2026-11-12', 1000000, 1000000, 'v1', now())$$,
  '23514', null, 'a hold always has a deadline (expires_at)'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2D', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, '2026-11-12', '2026-11-11', 1000000, 1000000, 'v1', now())$$,
  '23514', null, 'the last visit date is never before the first'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-ILOU1234', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, '2026-11-12', '2026-11-12', 1000000, 1000000, 'v1', now())$$,
  '23514', null, 'booking codes use Crockford base32 (no I, L, O, U)'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at, currency)
    values ('GSK-7F3K9Q2E', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, '2026-11-12', '2026-11-12', 1000000, 1000000, 'v1', now(), 'USD')$$,
  '23514', null, 'bookings are always in IDR'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at, idempotency_key)
    values ('GSK-7F3K9Q2F', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', '+6281234567890', 'x@example.test', 40, '2026-11-12', '2026-11-12', 1000000, 1000000, 'v1', now(), 'wizard-1')$$,
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

insert into public.reconciliation_runs (id, run_date, source) values ('00000000-0000-4000-8000-000000000101', '2026-11-12', 'nightly');
select throws_ok(
  $$insert into public.reconciliation_issues (run_id, issue_type, severity)
    values ('00000000-0000-4000-8000-000000000101', 'something_else', 'high')$$,
  '23514', null, 'reconciliation issues use a known type'
);

insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot)
values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0001', 'ABCDEFGH12', '2026-11-01', '{}');
select throws_ok(
  $$insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot)
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0002', 'ABCDEFGH13', '2026-11-01', '{}')$$,
  '23505', null, 'each quotation version exists once per booking'
);
select throws_ok(
  $$insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot, version)
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0003', 'ABCDEFGH14', '2026-11-01', '{}', 4)$$,
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

insert into public.tickets_qr (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
  valid_from, valid_until, pax_count, key_id)
values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000e1',
        '00000000-0000-4000-8000-0000000000e2', 5, '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2M-05',
        '2026-11-12', '2026-11-12 00:00+07', '2026-11-12 12:00+07', 40, 'k1');
select is(
  (select status from public.tickets_qr where id = '00000000-0000-4000-8000-000000000201'),
  'issued'::public.ticket_status,
  'a new ticket starts issued'
);
select throws_ok(
  $$insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
      valid_from, valid_until, pax_count, key_id)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', 5,
            '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2M-06', '2026-11-12',
            '2026-11-12 00:00+07', '2026-11-12 12:00+07', 40, 'k1')$$,
  '23505', null, 'one ticket per booking leg'
);
select throws_ok(
  $$update public.tickets_qr set ticket_code = 'GSK-7F3K9Q2M-5' where id = '00000000-0000-4000-8000-000000000201'$$,
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
values ('00000000-0000-4000-8000-0000000000e1', 'group', 'SERT/GSK/2026/00001', 'CERTGROUP1', 'SD Negeri Gisikdrono 01', '2026-11-12', '{5}');
select throws_ok(
  $$insert into public.certificates (booking_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
    values ('00000000-0000-4000-8000-0000000000e1', 'group', 'SERT/GSK/2026/00002', 'CERTGROUP2', 'x', '2026-11-12', '{5}')$$,
  '23505', null, 'a booking gets one group certificate'
);
select throws_ok(
  $$insert into public.certificates (booking_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
    values ('00000000-0000-4000-8000-0000000000e1', 'participant', 'SERT/GSK/2026/00003', 'CERTPART01', 'x', '2026-11-12', '{5}')$$,
  '23514', null, 'a participant certificate names its participant'
);
insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
select '00000000-0000-4000-8000-0000000000e1', id, 'participant', 'SERT/GSK/2026/00004', 'CERTPART02', full_name, '2026-11-12', '{5}'
from public.booking_participants where booking_id = '00000000-0000-4000-8000-0000000000e1' and seq_no = 1;
select throws_ok(
  $$insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
    select '00000000-0000-4000-8000-0000000000e1', id, 'participant', 'SERT/GSK/2026/00005', 'CERTPART03', full_name, '2026-11-12', '{5}'
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

select * from finish();
rollback;
