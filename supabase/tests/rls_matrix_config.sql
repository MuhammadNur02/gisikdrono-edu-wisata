-- RLS matrix for the configuration tables: rw_units, profiles, staff_invites, site_settings (docs/PRD.md §8.5.2,
-- Task P1.4.01, P1.4.05, P1.4.06, P1.9.02). Every check runs as an API role with GoTrue-shaped claims.
begin;
select plan(40);
\ir helpers/rls_personas.psql

update public.rw_units set treasury_account_number = '1230005' where id = 5;
insert into public.rw_units (id, code, slug, name, theme_label, is_active)
values (9, 'RW09', 'rw-09-uji', 'RW 09 Uji', 'Uji', false);
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
select throws_ok($$insert into public.rw_units (id, code, slug, name, theme_label)
  values (11, 'RW11', 'rw-11-uji', 'RW 11 Uji', 'Uji')$$, '42501', null, 'nor adds one');

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
select throws_ok($$select invite_code_hash from public.staff_invites$$, '42501', null,
  'and never reads an invite code''s hash back');
select is(pg_temp.row_count($$update public.site_settings set value = '"baru"',
  updated_by = '00000000-0000-4000-8000-00000000f001' where key = 'rls.private'$$), 1, 'edits a private setting');
select throws_ok($$update public.site_settings set is_public = true,
  updated_by = '00000000-0000-4000-8000-00000000f001' where key = 'rls.private'$$, '23514', null,
  'but makes no key public that docs/PRD.md §8.6 keeps private');
select is(pg_temp.row_count($$update public.rw_units set tagline = 'Baru' where id = 8$$), 1, 'edits any RW''s content');
select lives_ok($$insert into public.rw_units (id, code, slug, name, theme_label)
  values (10, 'RW10', 'rw-10-uji', 'RW 10 Uji', 'Uji')$$, 'adds an RW');
select throws_ok($$select treasury_account_number from public.rw_units$$, '42501', null,
  'and reads no treasury account through the API either');
select throws_ok($$update public.profiles set role = 'admin_rw', rw_id = 5
  where id = '00000000-0000-4000-8000-00000000f000'$$, '42501', null,
  'changes no role by a plain update; that is set_staff_role''s job');

select * from finish();
rollback;
