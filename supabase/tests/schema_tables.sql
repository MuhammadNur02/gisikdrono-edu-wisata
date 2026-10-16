-- Structure test for 0003_tables, extended group by group: exact columns, the types other code
-- relies on, keys, and the CHECK / unique rules proven by trying to break them.
begin;
select plan(31);

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

select * from finish();
rollback;
