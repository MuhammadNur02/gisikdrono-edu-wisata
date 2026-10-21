-- RLS matrix for the configuration tables: rw_units, profiles, staff_invites, site_settings (docs/PRD.md §8.5.2,
-- Task P1.4.01, P1.4.05, P1.4.06, P1.9.02). Every check runs as an API role with GoTrue-shaped claims.
begin;
select plan(68);
\ir helpers/rls_personas.psql

update public.rw_units set treasury_account_number = '1230005' where id = 5;
insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key, is_active)
values (9, 'RW09', 'rw-09-uji', 'RW 09 Uji', 'Uji', 'Uji', 'teal', 'users', false);
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000f055', 'rls-admin05-b@example.test');
insert into public.profiles (id, email, full_name, role, rw_id)
values ('00000000-0000-4000-8000-00000000f055', 'rls-admin05-b@example.test', 'Rekan RW 05', 'admin_rw', 5);
-- seo.default_description is one of the public keys of docs/PRD.md §8.6; 0008_seed may already hold it.
insert into public.site_settings (key, value, is_public) values
  ('seo.default_description', '"Edu Wisata Gisikdrono"', true), ('rls.private', '"tidak"', false)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;
insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
values ('calon@example.test', 'admin_rw', 5, 'hash-rls-1', now() + interval '72 hours', '00000000-0000-4000-8000-00000000f001');

-- ===== anon =====
select pg_temp.act_as('anon');
select is(
  (select string_agg(id::text, ',' order by id) from public.rw_units where id in (5, 8, 9)),
  '5,8',
  'anon sees the active RWs only'
);
select throws_ok($$select treasury_account_number from public.rw_units$$, '42501', null,
  'anon never reads a treasury account');
select throws_ok($$select id from public.profiles$$, '42501', null, 'anon reads no profile');
select is(
  (select string_agg(key, ',' order by key) from public.site_settings where key in ('seo.default_description', 'rls.private')),
  'seo.default_description',
  'anon reads the public settings only'
);
select throws_ok($$update public.rw_units set tagline = 'x' where id = 5$$, '42501', null, 'anon writes nothing');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is((select count(*)::int from public.rw_units where id in (5, 8, 9)), 0, 'a user without a role sees no RW');
select is((select count(*)::int from public.profiles where email::text like 'rls-%'), 0,
  'nor any profile, not even their own');
select is((select count(*)::int from public.site_settings where key in ('seo.default_description', 'rls.private')), 0,
  'nor any setting');

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is((select count(*)::int from public.rw_units where id in (5, 8)), 2,
  'an RW admin sees the public profile of both RWs');
select throws_ok($$select treasury_account_number from public.rw_units$$, '42501', null,
  'but no treasury account, not even their own');
select is(pg_temp.row_count($$update public.rw_units set tagline = 'Baru' where id = 5$$), 1,
  'edits their own RW''s content');
select is(pg_temp.row_count($$update public.rw_units set tagline = 'Baru' where id = 8$$), 0,
  'but not RW 08''s');
select throws_ok($$update public.rw_units set slug = 'lain' where id = 5$$, '42501', null,
  'nor their own RW''s slug');
select is(
  (select string_agg(email::text, ',' order by email) from public.profiles where email::text like 'rls-%'),
  'rls-admin05-b@example.test,rls-admin05@example.test',
  'sees their own profile and their RW''s colleagues, nobody else'
);
select is(pg_temp.row_count($$update public.profiles set full_name = 'Nama Baru'
  where id = '00000000-0000-4000-8000-00000000f005'$$), 1, 'edits their own name');
select is(pg_temp.row_count($$update public.profiles set full_name = 'Nama Baru'
  where id = '00000000-0000-4000-8000-00000000f055'$$), 0, 'but not a colleague''s');
select throws_ok($$update public.profiles set role = 'superadmin' where id = '00000000-0000-4000-8000-00000000f005'$$,
  '42501', null, 'and never their own role');
select is(
  (select string_agg(key, ',' order by key) from public.site_settings where key in ('seo.default_description', 'rls.private')),
  'seo.default_description',
  'reads the public settings only'
);
select throws_ok($$insert into public.site_settings (key, value, updated_by)
  values ('rls.mine', '"x"', '00000000-0000-4000-8000-00000000f005')$$, '42501', null, 'and writes none');
select is((select count(*)::int from public.staff_invites where email::text like 'calon%'), 0, 'sees no invite');
select throws_ok($$select public.invite_superadmin('rw-naik@example.test', 'hash-rls-rw')$$, '42501',
  'only the superadmin manages staff', 'and invites no superadmin');

-- ===== admin_rw 05 without AAL2 =====
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select is((select count(*)::int from public.profiles where email::text like 'rls-%'), 0,
  'without AAL2 an RW admin sees no profile, not even their own');
select is((select count(*)::int from public.rw_units where id in (5, 8, 9)), 0, 'nor any RW''s public profile');
select is(pg_temp.row_count($$update public.rw_units set tagline = 'Tanpa TOTP' where id = 5$$), 0,
  'and edits not even their own RW');

-- ===== superadmin at AAL1 =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is((select count(*)::int from public.profiles where email::text like 'rls-%'), 0,
  'a superadmin without AAL2 sees no profile');
select is((select count(*)::int from public.site_settings where key in ('seo.default_description', 'rls.private')), 0,
  'no setting');
select is((select count(*)::int from public.staff_invites where email::text like 'calon%'), 0, 'no invite');
select is((select count(*)::int from public.rw_units where id in (5, 8, 9)), 0, 'and no RW');
select throws_ok($$insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key)
  values (11, 'RW11', 'rw-11-uji', 'RW 11 Uji', 'Uji', 'Uji', 'teal', 'users')$$, '42501', null, 'nor adds one');

-- ===== superadmin at AAL2 with a TOTP code two hours old (docs/Security.md §5.3) =====
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select is((select count(*)::int from public.site_settings where key in ('seo.default_description', 'rls.private')), 2,
  'a superadmin whose code is two hours old still reads every setting');
select throws_ok($$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values ('calon-lima@example.test', 'admin_rw', 8, 'hash-rls-5', now() + interval '24 hours',
          '00000000-0000-4000-8000-00000000f001')$$, '42501', 'new row violates row-level security policy "staff_invites_fresh_totp_insert" for table "staff_invites"',
  'but invites nobody without a fresh code');
select throws_ok($$select public.invite_superadmin('calon-enam@example.test', 'hash-rls-6')$$, '42501',
  'confirm with a fresh authenticator code first', 'not even a superadmin through the RPC');
select is(pg_temp.row_count($$update public.staff_invites set revoked_at = now() where email = 'calon@example.test'$$), 0,
  'revokes no invite');
select throws_ok($$insert into public.site_settings (key, value, updated_by)
  values ('rls.basi', '"x"', '00000000-0000-4000-8000-00000000f001')$$, '42501', null, 'adds no setting');
select is(pg_temp.row_count($$update public.site_settings set value = '"basi"',
  updated_by = '00000000-0000-4000-8000-00000000f001' where key = 'rls.private'$$), 0, 'changes none');
select is(pg_temp.row_count($$delete from public.site_settings where key = 'rls.private'$$), 0, 'and removes none');
select throws_ok($$insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key)
  values (11, 'RW11', 'rw-11-uji', 'RW 11 Uji', 'Uji', 'Uji', 'teal', 'users')$$, '42501',
  'new row violates row-level security policy "rw_units_fresh_totp_insert" for table "rw_units"', 'nor adds an RW');

-- ===== superadmin at AAL2 =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select count(*)::int from public.profiles where email::text like 'rls-%'), 5, 'the superadmin sees every profile');
select is((select count(*)::int from public.site_settings where key in ('seo.default_description', 'rls.private')), 2,
  'every setting');
select lives_ok($$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values ('calon-dua@example.test', 'admin_rw', 8, 'hash-rls-2', now() + interval '72 hours',
          '00000000-0000-4000-8000-00000000f001')$$, 'invites staff');
select throws_ok($$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values ('calon-tiga@example.test', 'admin_rw', 8, 'hash-rls-3', now() + interval '72 hours',
          '00000000-0000-4000-8000-00000000f005')$$, '42501', null, 'in their own name only');
select throws_ok($$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values ('calon-empat@example.test', 'admin_rw', 8, 'hash-rls-4', now() + interval '73 hours',
          '00000000-0000-4000-8000-00000000f001')$$, '23514', null, 'for 72 hours at most');
-- A superadmin invite waits 24 hours like a promotion (review L9, decision of 2026-10-17).
select throws_ok($$insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values ('super-langsung@example.test', 'superadmin', null, 'hash-rls-s0', now() + interval '72 hours',
          '00000000-0000-4000-8000-00000000f001')$$, '42501',
  'a superadmin is invited only through invite_superadmin, which waits 24 hours',
  'even with a fresh code, a superadmin is never invited by a plain insert');
select is((select public.invite_superadmin('super-baru@example.test', 'hash-rls-s1') ->> 'stage'), 'requested',
  'only through invite_superadmin, which records the request');
select is(
  (select a.title from public.security_alerts a join public.staff_invites i on a.details ->> 'invite_id' = i.id::text
   where a.rule = 'superadmin_invite' and i.email = 'super-baru@example.test'),
  'Permintaan undangan superadmin',
  'and raises the same critical alert as a promotion to superadmin'
);
select lives_ok($$select public.invite_superadmin('super-dua@example.test', 'hash-rls-s2')$$, 'a second request');
select is(pg_temp.row_count($$update public.staff_invites set revoked_at = now() where email = 'calon@example.test'$$), 1,
  'revokes an invite');
select throws_ok($$update public.staff_invites set revoked_at = null where email = 'calon@example.test'$$, 'P0001',
  'a revoked invite stays revoked; make a new invite instead', 'and never brings it back');
select is(pg_temp.row_count($$update public.staff_invites set revoked_at = now() where email = 'super-baru@example.test'$$), 1,
  'revokes a superadmin invite');
select is(
  (select a.title from public.security_alerts a join public.staff_invites i on a.details ->> 'invite_id' = i.id::text
   where a.rule = 'superadmin_invite' and i.email = 'super-baru@example.test'),
  'Undangan superadmin dicabut',
  'which the alert reports as cancelled'
);
select throws_ok($$select invite_code_hash from public.staff_invites$$, '42501', null,
  'and never reads an invite code''s hash back');
select is(pg_temp.row_count($$update public.site_settings set value = '"baru"',
  updated_by = '00000000-0000-4000-8000-00000000f001' where key = 'rls.private'$$), 1, 'edits a private setting');
select throws_ok($$update public.site_settings set is_public = true,
  updated_by = '00000000-0000-4000-8000-00000000f001' where key = 'rls.private'$$, '23514', null,
  'but makes no key public that docs/PRD.md §8.6 keeps private');
select is(pg_temp.row_count($$update public.rw_units set tagline = 'Baru' where id = 8$$), 1, 'edits any RW''s content');
select lives_ok($$insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key)
  values (10, 'RW10', 'rw-10-uji', 'RW 10 Uji', 'Uji', 'Uji', 'teal', 'users')$$, 'adds an RW');
select is((select is_active from public.rw_units where id = 10), false, 'which starts offline');
select throws_ok($$insert into public.rw_units
  (id, code, slug, name, short_name, theme_label, accent_key, icon_key, is_active)
  values (12, 'RW12', 'rw-12-uji', 'RW 12 Uji', 'Uji', 'Uji', 'violet', 'landmark', true)$$, '42501', null,
  'and puts it online only through set_rw_unit_status, never by an insert');
select throws_ok($$select treasury_account_number from public.rw_units$$, '42501', null,
  'and reads no treasury account through the API either');
select throws_ok($$update public.profiles set role = 'admin_rw', rw_id = 5
  where id = '00000000-0000-4000-8000-00000000f000'$$, '42501', null,
  'changes no role by a plain update; that is set_staff_role''s job');
select throws_ok($$delete from public.site_settings where key = 'pricing.min_price_per_pax'$$, 'P0001',
  'site setting pricing.min_price_per_pax is required and cannot be removed',
  'removes no setting a function needs, the price floor among them');
select throws_ok($$update public.site_settings set value = 'null', updated_by = '00000000-0000-4000-8000-00000000f001'
  where key = 'pricing.min_price_per_pax'$$, '23514', 'site setting pricing.min_price_per_pax must be a number',
  'nor empties one');
select is(pg_temp.row_count($$delete from public.site_settings where key = 'rls.private'$$), 1,
  'but removes an ordinary setting');

-- ===== outside the API: the invite rules hold for the database owner too =====
reset role;
select throws_ok($$update public.staff_invites set revoked_at = null where email = 'calon@example.test'$$, 'P0001',
  'a revoked invite stays revoked; make a new invite instead', 'nobody brings a revoked invite back, not even postgres');
select throws_ok($$update public.staff_invites set accepted_at = now() where email = 'calon@example.test'$$, 'P0001',
  'a revoked invite cannot be accepted', 'nor accepts one');
select throws_ok($$update public.staff_invites set role = 'superadmin', rw_id = null where email = 'calon-dua@example.test'$$,
  '42501', 'an invite never changes whom it invites, as what, or who made it',
  'and an RW admin invite never becomes a superadmin invite');
select throws_ok($$update public.staff_invites set accepted_at = now() where email = 'super-dua@example.test'$$, 'P0001', null,
  'a superadmin invite cannot be accepted within 24 hours of the request');
-- A day later, as the onboarding service will accept it.
alter table public.staff_invites disable trigger staff_invites_guard;
update public.staff_invites set created_at = now() - interval '25 hours', expires_at = now() + interval '47 hours'
where email = 'super-dua@example.test';
alter table public.staff_invites enable trigger staff_invites_guard;
select lives_ok($$update public.staff_invites set accepted_at = now(), accepted_user_id = '00000000-0000-4000-8000-00000000f000'
  where email = 'super-dua@example.test'$$, 'but can a day later');
select is(
  (select a.title from public.security_alerts a join public.staff_invites i on a.details ->> 'invite_id' = i.id::text
   where a.rule = 'superadmin_invite' and i.email = 'super-dua@example.test'),
  'Undangan superadmin diterima',
  'which the alert reports as completed'
);

select * from finish();
rollback;
