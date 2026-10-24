-- Behaviour tests for 0004_functions, extended group by group. Runs as postgres, which owns every
-- function here, so internal.* bodies are called directly; the public hooks are checked to refuse
-- anyone but Auth.
begin;
select plan(431);
-- Every package write checks the price floor, which refuses to run without its setting (0005).
insert into public.site_settings (key, value) values ('pricing.min_price_per_pax', '5000') on conflict (key) do nothing;
-- Fixtures are dated relative to today, so the suite keeps passing as the calendar moves on. Only
-- next_document_number keeps fixed instants: it formats the moment it is given and never reads today.
create function pg_temp.days_from_today(p_days integer) returns date
  language sql stable
as $$ select public.today_jkt() + p_days; $$;
create function pg_temp.jakarta_time(p_days integer, p_time time) returns timestamptz
  language sql stable
as $$ select (public.today_jkt() + p_days + p_time) at time zone 'Asia/Jakarta'; $$;
grant execute on function pg_temp.days_from_today(integer), pg_temp.jakarta_time(integer, time) to public;
-- Whether this session holds the transaction advisory lock a function takes with
-- pg_advisory_xact_lock(hashtext(key)). Such a lock lasts until the test's transaction ends, so seeing
-- it after a call proves the call took it; the race it prevents needs two sessions to show.
create function pg_temp.holds_advisory_lock(p_key text) returns boolean
  language sql stable
as $$
  select exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1
      and l.classid = ((hashtext(p_key)::bigint >> 32) & 4294967295)::oid
      and l.objid = (hashtext(p_key)::bigint & 4294967295)::oid);
$$;

-- Fixtures, rolled back at the end. The pepper is a throwaway local value.
select vault.create_secret('local-test-pepper-not-a-real-secret-0000000', 'otp_pepper', 'test only');
insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key) values
  (5, 'RW05', 'rw-05-ecowastreme', 'RW 05 Ecowastreme', 'Ecowastreme', 'Ekowisata & Lingkungan', 'leaf', 'recycle'),
  (8, 'RW08', 'rw-08-inklusif-ramah-anak', 'RW 08 Kampung Inklusif & Ramah Anak', 'Kampung Inklusif & Ramah Anak',
   'Inklusif & Ramah Anak', 'mulberry', 'heart_handshake')
-- Reference rows: the seed and the integration tests may have written them already.
on conflict (id) do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'superadmin@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'admin05@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'former@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active, claims_version) values
  ('00000000-0000-4000-8000-000000000001', 'superadmin@example.test', 'Super Admin', 'superadmin', null, true, 1),
  ('00000000-0000-4000-8000-000000000002', 'admin05@example.test', 'Admin Lima', 'admin_rw', 5, true, 3),
  ('00000000-0000-4000-8000-000000000003', 'former@example.test', 'Mantan Staf', 'admin_rw', 8, false, 1);
-- The staff tests below need profile 0001 to be the only active superadmin. The development seed adds one of its
-- own, which this suite deactivates through the privileged path, inside its transaction.
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false, role = 'none', rw_id = null
where role = 'superadmin' and id <> '00000000-0000-4000-8000-000000000001';
select set_config('app.privileged_rpc', '', true);

-- ===== Contact masks on bookings =====

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax)
values ('00000000-0000-4000-8000-0000000000c1', 5, 'regular', 'eduwisata-ecowastreme', 'Eduwisata', 25000);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at)
values ('00000000-0000-4000-8000-0000000000e1', 'GSK-7F3K9Q2M', 'quoted', '00000000-0000-4000-8000-0000000000c1',
  '{}', '{5}', 'school', 'Siti Rahmawati', '+6281234567890', 'siti.rahmawati@example.test', 40,
  pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 1000000, 'v1', now());

select is(
  (select phone_masked || ' | ' || email_masked || ' | ' || pic_first_name
   from public.bookings where id = '00000000-0000-4000-8000-0000000000e1'),
  '+62812••••90 | s***@example.test | Siti',
  'the stored masks show six leading and two trailing digits, one email letter, and the first name'
);
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
      pic_name, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
      consent_version, consented_at)
    values ('GSK-7F3K9Q2A', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
      'x', 'x@example.test', 40, pg_temp.days_from_today(27), pg_temp.days_from_today(27), 1000000, 1000000, 'v1', now())$$,
  '23514', null, 'a booking without a phone is refused until it has been anonymised'
);
update public.bookings set pic_phone = null, pic_email = null, pic_name = 'anon', pii_purged_at = now()
where id = '00000000-0000-4000-8000-0000000000e1';
select is(
  (select phone_masked is null and email_masked is null and pic_first_name = 'anon'
   from public.bookings where id = '00000000-0000-4000-8000-0000000000e1'),
  true,
  'after anonymisation the masks are empty too'
);

-- ===== RLS helpers =====

-- A request from an RW 05 admin whose token matches the profile.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","app_role":"admin_rw","app_rw_id":5,"claims_version":3}', true);
set local role authenticated;
select is(public.app_role(), 'admin_rw', 'app_role() reads the role of a live token');
select is(public.app_rw_id(), 5::smallint, 'app_rw_id() reads the RW of an admin_rw token');
select is(public.is_admin_rw(), true, 'is_admin_rw() is true for an RW admin');
select is(public.is_superadmin(), false, 'is_superadmin() is false for an RW admin');
select is(public.is_staff(), true, 'is_staff() is true for an RW admin');
select is(public.owns_rw(5::smallint), true, 'owns_rw() is true for the admin''s own RW');
select is(public.owns_rw(8::smallint), false, 'owns_rw() is false for another RW');
select is(public.owns_rw(null::smallint), false, 'owns_rw(NULL) is false for an RW admin: kelurahan rows are superadmin-only');
select is(public.owns_any_rw(array[8, 5]::smallint[]), true, 'owns_any_rw() is true when the list contains the own RW');
select is(public.owns_any_rw(array[8]::smallint[]), false, 'owns_any_rw() is false when it does not');
select is(public.aal2(), true, 'aal2() reads the aal claim');
reset role;

-- The same user, but the token was minted before a role change (claims_version 2 vs 3 in profiles).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","app_role":"admin_rw","app_rw_id":5,"claims_version":2}', true);
set local role authenticated;
select is(public.app_role(), 'none', 'a token with a stale claims_version carries no role');
select is(public.app_rw_id(), null, 'and no RW');
select is(public.owns_rw(5::smallint), false, 'so it owns nothing');
reset role;

-- A deactivated staff member whose token has not expired yet.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2","app_role":"admin_rw","app_rw_id":8,"claims_version":1}', true);
set local role authenticated;
select is(public.app_role(), 'none', 'a deactivated profile degrades the token to none');
select is(public.is_staff(), false, 'and is not staff');
reset role;

-- A forged token for a user who has no profile at all.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated","aal":"aal2","app_role":"superadmin","claims_version":1}', true);
set local role authenticated;
select is(public.is_superadmin(), false, 'claims without a matching profile grant nothing');
reset role;

-- The superadmin, with an AAL1 session.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","app_role":"superadmin","claims_version":1}', true);
set local role authenticated;
select is(public.is_superadmin(), true, 'the superadmin is recognised');
select is(public.owns_rw(null::smallint), true, 'and owns kelurahan-level rows');
select is(public.owns_rw(8::smallint), true, 'and every RW');
select is(public.aal2(), false, 'aal2() is false before the TOTP step');
reset role;

-- No token at all (anon).
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(public.today_jkt(), (now() at time zone 'Asia/Jakarta')::date, 'anon can read today in Jakarta');
select throws_ok('select public.app_role()', '42501', null, 'anon cannot call app_role()');
select throws_ok('select public.is_staff()', '42501', null, 'anon cannot call is_staff()');
reset role;
set local role authenticated;
select is(public.app_role(), 'none', 'authenticated without claims is none');
reset role;

-- ===== Auth hooks =====

select is(
  internal.staff_token_claims('00000000-0000-4000-8000-000000000002'),
  '{"app_role": "admin_rw", "app_rw_id": 5, "claims_version": 3}'::jsonb,
  'token claims carry role, RW and claims_version from the profile'
);
select is(
  internal.staff_token_claims('00000000-0000-4000-8000-000000000003') ->> 'app_role',
  'none',
  'a deactivated profile gets the none role in its token'
);
select is(
  internal.staff_token_claims('00000000-0000-4000-8000-0000000000ff') ->> 'app_role',
  'none',
  'an auth user without a profile gets the none role'
);
select throws_ok(
  $$select public.custom_access_token_hook('{"user_id":"00000000-0000-4000-8000-000000000001","claims":{}}')$$,
  '42501', null, 'only Auth may call the access-token hook'
);

select is(
  internal.hash_email('  Siti.Rahmawati@Example.test '),
  internal.hash_email('siti.rahmawati@example.test'),
  'the email hash ignores case and surrounding spaces'
);
select is(
  internal.hash_email('siti.rahmawati@example.test'),
  encode(extensions.hmac(convert_to(E'gsk-login-email-v1\n' || 'siti.rahmawati@example.test', 'utf8'), 'local-test-pepper-not-a-real-secret-0000000'::bytea, 'sha256'), 'hex'),
  'the email hash is HMAC-SHA256 keyed with the Vault pepper under its own label'
);
select isnt(
  internal.hash_email('siti.rahmawati@example.test'),
  encode(extensions.digest('siti.rahmawati@example.test', 'sha256'), 'hex'),
  'and not a plain sha256'
);

select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000001', false) ->> 'decision', 'continue', 'failure 1 continues');
select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000001', false) ->> 'decision', 'continue', 'failure 2 continues');
-- Failures 3 and 4 sleep 0.5 s and 1 s; the delay is the behaviour, so the test pays for it.
select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000001', false) ->> 'decision', 'continue', 'failure 3 continues after a delay');
select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000001', false) ->> 'decision', 'continue', 'failure 4 continues after a delay');
select is(
  internal.record_login_attempt('00000000-0000-4000-8000-000000000001', false),
  '{"decision": "reject", "message": "Terlalu banyak percobaan. Coba lagi dalam 15 menit."}'::jsonb,
  'the fifth failure within 15 minutes is rejected with an Indonesian message'
);
select is(
  (select string_agg(reason, ',' order by id) from public.login_attempts where user_id = '00000000-0000-4000-8000-000000000001'),
  'bad_password,bad_password,bad_password,bad_password,locked',
  'every attempt is recorded with its reason'
);
select is(
  (select string_agg(event_type || ':' || severity, ',' order by id) from public.security_events
   where actor_id = '00000000-0000-4000-8000-000000000001'),
  'login_failed:info,login_failed:info,login_failed:info,login_failed:info,login_locked:medium',
  'four login_failed events then one login_locked'
);
select ok(
  not exists (select 1 from public.login_attempts where email_hash ilike '%example%'),
  'login attempts never store the address itself'
);
select is(
  internal.record_login_attempt('00000000-0000-4000-8000-000000000001', true) ->> 'decision',
  'reject',
  'even the right password is refused while the window is full'
);
select is(
  (select reason || '/' || success from public.login_attempts
   where user_id = '00000000-0000-4000-8000-000000000001' order by id desc limit 1),
  'locked/true',
  'the refused correct password is recorded as locked, with the password truthfully marked valid'
);
select is(
  (select count(*) from public.security_events
   where event_type = 'login_locked' and actor_id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one login_locked event per lockout, not one per refused attempt'
);
select ok(
  pg_temp.holds_advisory_lock('login_attempts:00000000-0000-4000-8000-000000000001'),
  'one user''s login attempts take turns, so parallel guesses cannot all see a short count'
);
select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000002', true) ->> 'decision', 'continue', 'another user with a correct password continues');
select throws_ok(
  $$select public.hook_password_verification_attempt('{"user_id":"00000000-0000-4000-8000-000000000001","valid":false}')$$,
  '42501', null, 'only Auth may call the password hook'
);
select is(
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
   where r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
     and has_function_privilege(r.oid, 'public.custom_access_token_hook(jsonb)', 'execute')
     and has_function_privilege(r.oid, 'public.hook_password_verification_attempt(jsonb)', 'execute')),
  'supabase_auth_admin',
  'Auth is the only API role that can execute either hook (signing in through GoTrue: tests/integration)'
);

-- ===== Definer template (Task P1.3.04) =====
-- Search paths, owners and the execute allow-lists are enumerated over the whole catalogue in rls_enumeration.sql.

-- ===== profiles_guard (Task P1.3.05) =====

select throws_ok(
  $$update public.profiles set role = 'admin_rw', rw_id = 5 where id = '00000000-0000-4000-8000-000000000001'$$,
  '42501', 'role, rw_id, is_active, mfa_required and email change only through set_staff_role / set_staff_status',
  'a role cannot change outside the privileged RPCs'
);
select throws_ok(
  $$update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'nor a status'
);
select throws_ok(
  $$update public.profiles set email = 'other@example.test' where id = '00000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'nor the email'
);
select throws_ok(
  $$update public.profiles set promotion_requested_at = now() - interval '2 days',
      promotion_requested_by = '00000000-0000-4000-8000-000000000001' where id = '00000000-0000-4000-8000-000000000002'$$,
  '42501', 'promotion and MFA reset requests change only through their RPCs',
  'nor a pending promotion, which a backdated request would let skip its 24-hour wait (review N1)'
);
select throws_ok(
  $$update public.profiles set mfa_reset_requested_at = now() - interval '2 days' where id = '00000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'nor a pending MFA reset'
);
select is(
  (select bool_or(has_column_privilege('authenticated', 'public.profiles', request_column, 'UPDATE'))
   from unnest(array['mfa_reset_requested_at', 'mfa_reset_requested_by', 'promotion_requested_at',
                     'promotion_requested_by']) as request_column),
  false,
  'and authenticated holds no UPDATE on the request columns'
);
select lives_ok(
  $$update public.profiles set full_name = 'Admin Lima Baru' where id = '00000000-0000-4000-8000-000000000002'$$,
  'ordinary profile fields change freely'
);
select is(
  (select claims_version from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  3,
  'and leave claims_version alone'
);

select set_config('app.privileged_rpc', 'on', true);
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.profiles set role = 'admin_rw', rw_id = 5 where id = '00000000-0000-4000-8000-000000000001'$$,
  '42501', 'a staff member cannot change their own role or status',
  'even a privileged RPC never touches the caller''s own row'
);
select throws_ok(
  $$update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'not even to deactivate themselves'
);
select lives_ok(
  $$update public.profiles set rw_id = 8 where id = '00000000-0000-4000-8000-000000000002'$$,
  'a privileged RPC may move an admin to another RW'
);
select is(
  (select claims_version from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  4,
  'and that bumps claims_version, so the old token stops working'
);

-- A second superadmin, acting on the first.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000004', 'second@example.test');
insert into public.profiles (id, email, full_name, role, is_active) values
  ('00000000-0000-4000-8000-000000000004', 'second@example.test', 'Super Dua', 'superadmin', false);
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000001'$$,
  'P0001', 'the last active superadmin cannot be demoted or deactivated',
  'the only active superadmin cannot be deactivated'
);
select throws_ok(
  $$update public.profiles set role = 'admin_rw', rw_id = 5 where id = '00000000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'nor demoted'
);
-- The first superadmin activates the second (nobody may activate themselves), then the second
-- deactivates the first.
select throws_ok(
  $$update public.profiles set is_active = true where id = '00000000-0000-4000-8000-000000000004'$$,
  '42501', null, 'activation is also a status change nobody may apply to themselves'
);
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000001', true);
update public.profiles set is_active = true where id = '00000000-0000-4000-8000-000000000004';
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000001'$$,
  'once another superadmin is active, the first can be deactivated'
);
select ok(
  pg_temp.holds_advisory_lock('profiles:active_superadmins'),
  'and removing a superadmin waits its turn, so two cannot remove each other at once'
);
select ok(not pg_temp.holds_advisory_lock('a-key-nobody-took'), 'the lock check tells a held lock from any other');
-- Put the first superadmin back; later sections sign in as them.
update public.profiles set is_active = true where id = '00000000-0000-4000-8000-000000000001';
select set_config('app.privileged_rpc', '', true);
select set_config('app.actor_id', '', true);

select throws_ok(
  $$update public.profiles set claims_version = claims_version - 1 where id = '00000000-0000-4000-8000-000000000002'$$,
  '42501', 'claims_version never goes back', 'claims_version never goes back, not even for the system'
);
-- A new profile from outside the system and privileged paths starts without a role.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000005', 'baru@example.test');
set local role service_role;
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into public.profiles (id, email, full_name, role, is_active)
    values ('00000000-0000-4000-8000-000000000005', 'baru@example.test', 'Orang Baru', 'superadmin', true)$$,
  '42501', 'a new profile starts without a role; set_staff_role gives it one',
  'the service role cannot create a superadmin profile'
);
select throws_ok(
  $$insert into public.profiles (id, email, full_name, role, rw_id, is_active)
    values ('00000000-0000-4000-8000-000000000005', 'baru@example.test', 'Orang Baru', 'admin_rw', 5, true)$$,
  '42501', null, 'nor an RW admin'
);
select throws_ok(
  $$insert into public.profiles (id, email, full_name, role, is_active, promotion_requested_at, promotion_requested_by)
    values ('00000000-0000-4000-8000-000000000005', 'baru@example.test', 'Orang Baru', 'none', true, now() - interval '2 days',
            '00000000-0000-4000-8000-000000000001')$$,
  '42501', 'a new profile starts without a pending staff change',
  'nor one carrying a backdated promotion request (review N1)'
);
select lives_ok(
  $$insert into public.profiles (id, email, full_name, role, is_active)
    values ('00000000-0000-4000-8000-000000000005', 'baru@example.test', 'Orang Baru', 'none', true)$$,
  'only a profile without a role'
);
select set_config('app.actor_id', '', true);
reset role;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000a0e01', 'sistem@example.test');
select throws_ok(
  $$insert into public.profiles (id, email, full_name, mfa_reset_requested_at)
    values ('00000000-0000-4000-8000-0000000a0e01', 'sistem@example.test', 'Lewat Sistem', now() - interval '2 days')$$,
  '42501', 'a new profile starts without a pending staff change',
  'not even the system starts a profile with a pending request'
);

-- ===== Guard triggers (Task P1.3.06, P1.3.07) =====

-- 0005 has not granted the API roles anything yet, so this section lends authenticated a wide-open
-- door on the tables under test; the guards must hold on their own. All of it rolls back.
grant select, insert, update, delete on public.rw_units, public.umkm_vendors, public.products_umkm,
  public.tour_packages, public.tour_package_legs, public.articles, public.visit_sessions to authenticated;
create policy test_open on public.rw_units for all to authenticated using (true) with check (true);
create policy test_open on public.umkm_vendors for all to authenticated using (true) with check (true);
create policy test_open on public.products_umkm for all to authenticated using (true) with check (true);
create policy test_open on public.tour_packages for all to authenticated using (true) with check (true);
create policy test_open on public.tour_package_legs for all to authenticated using (true) with check (true);
create policy test_open on public.articles for all to authenticated using (true) with check (true);
create policy test_open on public.visit_sessions for all to authenticated using (true) with check (true);

insert into public.umkm_vendors (id, rw_id, slug, name)
values ('00000000-0000-4000-8000-0000000000d1', 5, 'pkk-rw-05', 'PKK RW 05');
insert into public.articles (id, slug, title, status, rw_id)
values ('00000000-0000-4000-8000-000000000401', 'berita-lama', 'Berita lama', 'published', 5);
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
values ('00000000-0000-4000-8000-0000000000b1', 5, pg_temp.days_from_today(27), '08:00', '10:00', 'Sesi Pagi', 40),
       ('00000000-0000-4000-8000-0000000000b2', 5, pg_temp.days_from_today(28), '08:00', '10:00', 'Sesi Pagi', 40);

-- As an RW 05 admin of this section's own, with the claims their profile holds: the staff tests above moved
-- profile 0002 to RW 08, so its old hand-written claims named no real admin_rw at all.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000a0e05', 'penjaga05@example.test');
insert into public.profiles (id, email, full_name, role, rw_id)
values ('00000000-0000-4000-8000-0000000a0e05', 'penjaga05@example.test', 'Penjaga RW 05', 'admin_rw', 5);
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role,
                            'app_rw_id', rw_id, 'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-0000000a0e05'), true);
set local role authenticated;
select lives_ok(
  $$update public.rw_units set tagline = 'Hijau dan bersih' where id = 5$$,
  'an RW admin may edit the public profile of an RW'
);
select throws_ok(
  $$update public.rw_units set treasury_account_number = '1234567890' where id = 5$$,
  '42501', null, 'but not its treasury account'
);
select throws_ok(
  $$update public.rw_units set slug = 'rw-lima' where id = 5$$,
  '42501', null, 'nor its slug'
);
select throws_ok(
  $$update public.umkm_vendors set bank_account_number = '1234567890' where id = '00000000-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'an RW admin cannot record a vendor''s bank account'
);
select throws_ok(
  $$insert into public.umkm_vendors (rw_id, slug, name, bank_name) values (5, 'warung-bu-sri', 'Warung Bu Sri', 'BCA')$$,
  '42501', null, 'not even when creating the vendor'
);
select lives_ok(
  $$insert into public.umkm_vendors (rw_id, slug, name) values (5, 'warung-bu-sri', 'Warung Bu Sri')$$,
  'a vendor without bank details is fine'
);
select throws_ok(
  $$insert into public.products_umkm (rw_id, vendor_id, slug, name, category, price)
    values (8, '00000000-0000-4000-8000-0000000000d1', 'kompos-rw08', 'Kompos', 'compost', 15000)$$,
  'P0001', 'a product must belong to the same RW as its vendor',
  'a product cannot be filed under another RW than its vendor'
);
select throws_ok(
  $$insert into public.tour_packages (category, slug, name, pricing_basis, flat_price)
    values ('combo', 'kombinasi-rw', 'Kombinasi', 'flat_group', 1500000)$$,
  '42501', null, 'an RW admin cannot create a combo package'
);
select lives_ok(
  $$insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax)
    values ('00000000-0000-4000-8000-0000000000c3', 5, 'student', 'paket-pelajar', 'Paket Pelajar', 20000)$$,
  'an RW admin creates a package for their RW'
);
select is(
  (select rw_id || '/' || leg_order from public.tour_package_legs where package_id = '00000000-0000-4000-8000-0000000000c3'),
  '5/1',
  'and its single leg is written for them'
);
select throws_ok(
  $$insert into public.articles (slug, title, status, rw_id) values ('berita-baru', 'Berita baru', 'published', 5)$$,
  '42501', null, 'an RW admin cannot publish an article'
);
select lives_ok(
  $$update public.articles set title = 'Berita lama, diperbarui' where id = '00000000-0000-4000-8000-000000000401'$$,
  'an RW admin may edit a live article'
);
select is(
  (select status from public.articles where id = '00000000-0000-4000-8000-000000000401'),
  'pending_review'::public.content_status,
  'which takes it back to review instead of changing what the public reads'
);
reset role;

-- As the superadmin, with a token minted after the profiles_guard scenario bumped claims_version.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'app_role', 'superadmin',
  'claims_version', (select claims_version from public.profiles where id = '00000000-0000-4000-8000-000000000001')
)::text, true);
set local role authenticated;
select lives_ok(
  $$update public.rw_units set treasury_account_number = '1234567890' where id = 5$$,
  'the superadmin records the treasury account'
);
select lives_ok(
  $$insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price)
    values ('00000000-0000-4000-8000-0000000000c4', 'combo', 'kombinasi', 'Kombinasi', 'flat_group', 1500000)$$,
  'the superadmin creates a combo as a draft'
);
select throws_ok(
  $$update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000000c4'$$,
  'P0001', 'a combo package needs legs in at least two different RWs before it is published',
  'a combo with no legs cannot be published'
);
insert into public.tour_package_legs (package_id, rw_id, leg_order) values ('00000000-0000-4000-8000-0000000000c4', 5, 1);
select throws_ok(
  $$update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000000c4'$$,
  'P0001', null, 'one RW is still not a combo'
);
insert into public.tour_package_legs (package_id, rw_id, leg_order) values ('00000000-0000-4000-8000-0000000000c4', 8, 2);
select lives_ok(
  $$update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000000c4'$$,
  'with legs in two RWs the combo publishes'
);
select lives_ok(
  $$update public.articles set status = 'published' where id = '00000000-0000-4000-8000-000000000401'$$,
  'the superadmin publishes the reviewed article'
);
select is(
  (select reviewed_by from public.articles where id = '00000000-0000-4000-8000-000000000401'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'and is recorded as its reviewer'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Reviews: moderation is stamped.
insert into public.reviews (id, booking_id, rw_ids, rating, body, reviewer_name)
values ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000e1', '{5}', 5, 'Kunjungan yang seru sekali', 'Siti');
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000001', true);
update public.reviews set status = 'published' where id = '00000000-0000-4000-8000-000000000701';
select is(
  (select moderated_by::text || ' ' || (moderated_at is not null) from public.reviews where id = '00000000-0000-4000-8000-000000000701'),
  '00000000-0000-4000-8000-000000000001 true',
  'a moderation decision records who made it and when'
);
select set_config('app.actor_id', '', true);

-- Quotations: verified phone first, three versions at most.
select throws_ok(
  $$insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot)
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0001', 'ABCDEFGH11', pg_temp.days_from_today(16), '{}')$$,
  'P0001', 'a quotation is issued only after the phone number is verified',
  'no quotation before the phone is verified'
);
update public.bookings set phone_verified_at = now() where id = '00000000-0000-4000-8000-0000000000e1';
insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot, version) values
  ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0001', 'ABCDEFGH11', pg_temp.days_from_today(16), '{}', 1),
  ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0002', 'ABCDEFGH12', pg_temp.days_from_today(16), '{}', 2),
  ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0003', 'ABCDEFGH13', pg_temp.days_from_today(16), '{}', 3);
select throws_ok(
  $$insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot, version)
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0004', 'ABCDEFGH14', pg_temp.days_from_today(16), '{}', 1)$$,
  'P0001', 'a booking gets at most three quotation versions',
  'the fourth quotation is refused'
);

-- Revenue rules: lines add up to 100 at commit; a used rule only closes. The package's own rule, as the seed's RW 05
-- default is already in force (revenue_share_rules_no_overlap).
insert into public.revenue_share_rules (id, scope, package_id, name)
values ('00000000-0000-4000-8000-000000000501', 'package', '00000000-0000-4000-8000-0000000000c1', 'Paket Eduwisata');
-- The sum check is deferred to commit; switching it to immediate mode shows what commit would say.
set constraints revenue_rule_sum_guard immediate;
select throws_ok(
  $$insert into public.revenue_share_rule_lines (rule_id, beneficiary, pct)
    values ('00000000-0000-4000-8000-000000000501', 'kelurahan', 20)$$,
  'P0001', 'the shares of a revenue rule must add up to 100 % (got 20.00)',
  'a rule whose lines stop at 20 % cannot be committed'
);
set constraints revenue_rule_sum_guard deferred;
insert into public.revenue_share_rule_lines (rule_id, beneficiary, pct)
values ('00000000-0000-4000-8000-000000000501', 'kelurahan', 20);
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
values ('00000000-0000-4000-8000-000000000501', 'rw_treasury', 5, 80);
set constraints revenue_rule_sum_guard immediate;
select pass('written line by line, 20 + 80 passes the check at commit');
select throws_ok(
  $$delete from public.revenue_share_rule_lines where rule_id = '00000000-0000-4000-8000-000000000501' and beneficiary = 'kelurahan'$$,
  'P0001', null, 'removing a line from a complete rule is refused'
);
insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_id, rule_version, beneficiary, beneficiary_key,
  rw_id, base_amount, pct, amount, entry_hash)
values ('00000000-0000-4000-8000-0000000000e1', 'settlement', 'package', '00000000-0000-4000-8000-000000000501', '{}',
  'rw_treasury', 'rw:5', 5, 1000000, 80, 800000, 'hash-rule-used');
select throws_ok(
  $$update public.revenue_share_rules set name = 'Paket Eduwisata v2' where id = '00000000-0000-4000-8000-000000000501'$$,
  'P0001', null, 'a rule the ledger used cannot be renamed'
);
select throws_ok(
  $$update public.revenue_share_rule_lines set pct = 50 where rule_id = '00000000-0000-4000-8000-000000000501'$$,
  'P0001', null, 'nor can its lines move'
);
select lives_ok(
  $$update public.revenue_share_rules set effective_to = pg_temp.days_from_today(76), is_active = false where id = '00000000-0000-4000-8000-000000000501'$$,
  'but it can be closed to make room for a new version'
);

-- Sessions with bookings. The leg status and the counter are fenced; this fixture plays the
-- transition function.
select set_config('app.in_rpc', '1', true);
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
values ('00000000-0000-4000-8000-0000000000e1', 5, '00000000-0000-4000-8000-0000000000b1', 1, 40, 'reserved', now());
update public.visit_sessions set reserved_pax = 40 where id = '00000000-0000-4000-8000-0000000000b1';
select set_config('app.in_rpc', '', true);
select throws_ok(
  $$delete from public.visit_sessions where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'P0001', 'a session with bookings cannot be deleted', 'a booked session cannot be deleted'
);
select throws_ok(
  $$update public.visit_sessions set status = 'cancelled' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'P0001', null, 'nor cancelled'
);
select throws_ok(
  $$update public.visit_sessions set start_time = '09:00' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'P0001', null, 'nor moved in time'
);
select throws_ok(
  $$update public.visit_sessions set capacity = 30 where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'P0001', 'capacity cannot go below the seats already reserved (40)', 'nor shrunk below what is reserved'
);
select lives_ok(
  $$update public.visit_sessions set capacity = 50, label = 'Sesi Pagi (diperbesar)' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'it may grow or be relabelled'
);
select is(
  (select count(*) from public.security_events
   where event_type = 'session_changed_with_bookings' and entity_id = '00000000-0000-4000-8000-0000000000b1'),
  1::bigint,
  'and that change under bookings is logged'
);
select lives_ok(
  $$delete from public.visit_sessions where id = '00000000-0000-4000-8000-0000000000b2'$$,
  'an empty session can still be deleted'
);
select throws_ok(
  'select internal.visit_sessions_guard()', '0A000', 'trigger functions can only be called as triggers',
  'Postgres itself refuses to run a guard outside a trigger'
);

-- ===== Status fences and immutability (Task P1.3.08, P1.3.09, P1.3.11) =====

-- New rows start where their state machine starts, unless a transition function writes them.
select throws_ok(
  $$insert into public.bookings (booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
      pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
      consented_at, paid_at, amount_paid)
    values ('GSK-7F3K9Q2V', 'paid', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school', 'Uji',
      '+6281234567893', 'uji@example.test', 4, pg_temp.days_from_today(27), pg_temp.days_from_today(27),
      100000, 100000, 'v1', now(), now(), 100000)$$,
  '42501', 'bookings.status starts at quoted unless a transition function writes it',
  'a booking cannot be created already paid'
);
select throws_ok(
  $$insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount, status)
    values ('00000000-0000-4000-8000-0000000000e1', 9, 'midtrans', 'GSK-7F3K9Q2M-09', 1000000, 'settled')$$,
  '42501', null, 'a payment cannot be recorded already settled'
);
select throws_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity, reserved_pax)
    values (5, pg_temp.days_from_today(40), '06:00', '07:00', 'Penuh palsu', 20, 20)$$,
  '42501', 'visit_sessions.reserved_pax starts at 0 unless a transition function writes it',
  'an RW admin cannot create a session that already looks full'
);
select throws_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity, checked_in_pax)
    values (5, pg_temp.days_from_today(40), '06:00', '07:00', 'Hadir palsu', 20, 15)$$,
  '42501', null, 'nor one with visitors already checked in'
);
select lives_ok(
  $$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity)
    values (5, pg_temp.days_from_today(40), '06:00', '07:00', 'Sesi baru', 20)$$,
  'a session that starts empty is fine'
);

-- Even a transition function moves a booking only along docs/PRD.md §9.2.
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at)
values ('00000000-0000-4000-8000-0000000000ea', 'GSK-7F3K9Q2T', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}',
  '{5}', 'school', 'Uji Transisi', '+6281234567894', 'transisi@example.test', 4, pg_temp.days_from_today(27),
  pg_temp.days_from_today(27), 100000, 100000, 'v1', now());
select set_config('app.in_rpc', '1', true);
select throws_ok(
  $$update public.bookings set status = 'paid', paid_at = now(), amount_paid = 100000
    where id = '00000000-0000-4000-8000-0000000000ea'$$,
  'P0001', 'a booking does not go from quoted to paid', 'a quoted booking cannot jump straight to paid'
);
select lives_ok(
  $$update public.bookings set status = 'pending_payment', expires_at = now() + interval '2 hours'
    where id = '00000000-0000-4000-8000-0000000000ea'$$,
  'it goes to pending_payment first'
);
select lives_ok(
  $$update public.bookings set status = 'paid', paid_at = now(), amount_paid = 100000
    where id = '00000000-0000-4000-8000-0000000000ea'$$,
  'and from there to paid'
);
select throws_ok(
  $$update public.bookings set status = 'quoted' where id = '00000000-0000-4000-8000-0000000000ea'$$,
  'P0001', null, 'a paid booking never goes back to quoted'
);

-- A refund is recorded only by record_refund, by a superadmin at AAL2, while a settled payment holds the
-- money (review N2): from a cancelled, completed or no-show booking, or one still awaiting payment whose
-- money arrived under review, as well as from a paid or checked-in one.
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, expires_at)
select id::uuid, code, status::public.booking_status, '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school', 'Uji Refund',
  phone, code || '@example.test', 4, pg_temp.days_from_today(-3), pg_temp.days_from_today(-3), 100000, 100000, 'v1',
  now(), case when status = 'pending_payment' then now() + interval '2 hours' end
from (values
  ('00000000-0000-4000-8000-0000000002a1', 'GSK-RFND00A1', 'cancelled', '+6281234567201'),
  ('00000000-0000-4000-8000-0000000002a2', 'GSK-RFND00A2', 'completed', '+6281234567202'),
  ('00000000-0000-4000-8000-0000000002a3', 'GSK-RFND00A3', 'no_show', '+6281234567203'),
  ('00000000-0000-4000-8000-0000000002a4', 'GSK-RFND00A4', 'pending_payment', '+6281234567204'),
  ('00000000-0000-4000-8000-0000000002a5', 'GSK-RFND00A5', 'cancelled', '+6281234567205'),
  ('00000000-0000-4000-8000-0000000002a6', 'GSK-RFND00A6', 'cancelled', '+6281234567206')
) as fixture(id, code, status, phone);
insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount, status)
select ('00000000-0000-4000-8000-0000000002' || suffix)::uuid, 1, 'midtrans', 'GSK-RFND00' || upper(suffix) || '-01', 100000, 'settled'
from unnest(array['a1', 'a2', 'a3', 'a4', 'a6']) as suffix;

select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role,
                            'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000001'), true);
select throws_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a1'$$,
  '42501', 'a booking becomes refunded only through record_refund, by a superadmin at AAL2',
  'no transition function but record_refund refunds a booking'
);
select set_config('app.recording_refund', '1', true);
select lives_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a1'$$,
  'record_refund, run by a superadmin at AAL2, refunds a paid booking that was cancelled'
);
select lives_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a2'$$,
  'a completed one'
);
select lives_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a3'$$,
  'a no-show'
);
select lives_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a4'$$,
  'and one still awaiting payment whose money arrived under review'
);
select throws_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a5'$$,
  'P0001', 'a booking is refunded only while it has a settled payment',
  'but never a cancelled booking that received no money'
);
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal1', 'app_role', role,
                            'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000001'), true);
select throws_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a6'$$,
  '42501', null, 'nor by a superadmin who has not passed the TOTP step'
);
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role, 'app_rw_id', rw_id,
                            'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000002'), true);
select throws_ok(
  $$update public.bookings set status = 'refunded' where id = '00000000-0000-4000-8000-0000000002a6'$$,
  '42501', null, 'nor by an RW admin'
);
select set_config('app.recording_refund', '', true);
select set_config('request.jwt.claims', '', true);
select set_config('app.in_rpc', '', true);

select throws_ok(
  $$update public.bookings set status = 'pending_payment', expires_at = now() + interval '2 hours'
    where id = '00000000-0000-4000-8000-0000000000e1'$$,
  '42501', 'bookings.status is written only by the transition functions',
  'a booking status does not move outside a transition function'
);
select set_config('app.in_rpc', '1', true);
select lives_ok(
  $$update public.bookings set status = 'pending_payment', expires_at = now() + interval '2 hours'
    where id = '00000000-0000-4000-8000-0000000000e1'$$,
  'inside one it does'
);
select set_config('app.in_rpc', '', true);
select throws_ok(
  $$update public.bookings set booking_code = 'GSK-AAAAAAAA' where id = '00000000-0000-4000-8000-0000000000e1'$$,
  '42501', null, 'a booking code never changes'
);
select throws_ok(
  $$update public.bookings set rw_ids = '{5,8}' where id = '00000000-0000-4000-8000-0000000000e1'$$,
  '42501', null, 'nor the RWs a booking belongs to'
);

insert into public.payments (id, booking_id, attempt_no, provider, order_id, gross_amount)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'midtrans', 'GSK-7F3K9Q2M-01', 1000000);
select throws_ok(
  $$update public.payments set status = 'settled' where id = '00000000-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'a payment status does not move outside a transition function'
);
select set_config('app.in_rpc', '1', true);
select lives_ok(
  $$update public.payments set status = 'settled', settlement_time = now() where id = '00000000-0000-4000-8000-0000000000f1'$$,
  'the transition settles it'
);
select throws_ok(
  $$update public.payments set gross_amount = 999 where id = '00000000-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'what was charged never changes, not even inside a transition'
);
select throws_ok(
  $$update public.payments set method = 'qris' where id = '00000000-0000-4000-8000-0000000000f1'$$,
  'P0001', 'a payment Midtrans settled only changes its status and refunded amount', 'a settled payment is frozen'
);
select throws_ok(
  $$delete from public.payments where id = '00000000-0000-4000-8000-0000000000f1'$$,
  '42501', 'payments are never deleted', 'and never deleted'
);
select lives_ok(
  $$update public.bookings set status = 'paid', paid_at = now(), amount_paid = 1000000 where id = '00000000-0000-4000-8000-0000000000e1'$$,
  'settlement marks the booking paid and records the amount in the same step'
);
select set_config('app.in_rpc', '', true);
select throws_ok(
  $$update public.bookings set subtotal_package = 900000, total_amount = 900000 where id = '00000000-0000-4000-8000-0000000000e1'$$,
  'P0001', 'the money on a paid booking changes only through an approved adjustment', 'paid money is frozen'
);
select set_config('app.adjustment_id', '00000000-0000-4000-8000-000000000901', true);
select lives_ok(
  $$update public.bookings set subtotal_package = 900000, total_amount = 900000 where id = '00000000-0000-4000-8000-0000000000e1'$$,
  'an approved adjustment may correct it'
);
select set_config('app.adjustment_id', '', true);

-- Discounts: the superadmin's call, only before the money moves.
grant select, update on public.bookings to authenticated;
create policy test_open on public.bookings for all to authenticated using (true) with check (true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at)
values ('00000000-0000-4000-8000-0000000000e5', 'GSK-7F3K9Q2N', 'quoted', '00000000-0000-4000-8000-0000000000c1',
  '{}', '{5}', 'school', 'Budi Santoso', '+6281234567891', 'budi@example.test', 20,
  pg_temp.days_from_today(28), pg_temp.days_from_today(28), 500000, 500000, 'v1', now());
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","app_role":"admin_rw","app_rw_id":5,"claims_version":3}', true);
set local role authenticated;
select throws_ok(
  $$update public.bookings set discount_amount = 50000, total_amount = 450000 where id = '00000000-0000-4000-8000-0000000000e5'$$,
  '42501', 'only the superadmin gives a discount', 'an RW admin cannot give a discount'
);
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'aal', 'aal2', 'app_role', 'superadmin',
  'claims_version', (select claims_version from public.profiles where id = '00000000-0000-4000-8000-000000000001')
)::text, true);
set local role authenticated;
select lives_ok(
  $$update public.bookings set discount_amount = 50000, total_amount = 450000 where id = '00000000-0000-4000-8000-0000000000e5'$$,
  'the superadmin discounts a quoted booking'
);
select throws_ok(
  $$update public.bookings set discount_amount = 100000, discount_note = 'terlambat' where id = '00000000-0000-4000-8000-0000000000e1'$$,
  'P0001', 'a discount changes only while the booking is quoted or awaiting payment', 'but not a paid one'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Add-ons and invoices follow the booking's money.
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price)
values ('00000000-0000-4000-8000-0000000000d2', 5, '00000000-0000-4000-8000-0000000000d1', 'keripik-daun', 'Keripik', 'snack', 10000);
insert into public.booking_addons (id, booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty, line_total)
values ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d2', 5,
        '00000000-0000-4000-8000-0000000000d1', 'Keripik', 10000, 3, 30000);
select throws_ok(
  $$update public.booking_addons set qty = 5, line_total = 50000 where id = '00000000-0000-4000-8000-000000000801'$$,
  'P0001', null, 'the add-ons of a paid booking are frozen'
);
select lives_ok(
  $$update public.booking_addons set fulfillment_status = 'prepared' where id = '00000000-0000-4000-8000-000000000801'$$,
  'but the kitchen may still mark them prepared'
);
insert into public.invoices (id, booking_id, invoice_number, amount_due, snapshot)
values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000e1', 'INV/GSK/2026/10/0001', 1000000, '{}');
update public.invoices set status = 'paid', paid_at = now(), amount_paid = 1000000, receipt_number = 'KW/GSK/2026/10/0001'
where id = '00000000-0000-4000-8000-000000000102';
select throws_ok(
  $$update public.invoices set amount_due = 1 where id = '00000000-0000-4000-8000-000000000102'$$,
  'P0001', 'a paid invoice changes only through an approved adjustment', 'a paid invoice is frozen'
);
select throws_ok(
  $$update public.invoices set invoice_number = 'INV/GSK/2026/10/0099' where id = '00000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'an invoice number never changes'
);
select lives_ok(
  $$update public.invoices set status = 'void', void_reason = 'dikoreksi dengan nota kredit', voided_at = now(),
      credit_note_number = 'CN/GSK/2026/0001' where id = '00000000-0000-4000-8000-000000000102'$$,
  'a paid invoice can still be voided with a credit note'
);

-- Quota counters and leg states.
select throws_ok(
  $$update public.visit_sessions set reserved_pax = 41 where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', 'visit_sessions.reserved_pax is written only by the transition functions', 'the quota counter is fenced'
);
select throws_ok(
  $$update public.booking_legs set status = 'checked_in', checked_in_at = now()
    where booking_id = '00000000-0000-4000-8000-0000000000e1' and rw_id = 5$$,
  '42501', null, 'a leg status is fenced'
);
select set_config('app.in_rpc', '1', true);
select lives_ok(
  $$update public.visit_sessions set reserved_pax = 41 where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'the transition functions move the counter'
);
select set_config('app.in_rpc', '', true);

-- Tickets need money and never come back from the dead.
select throws_ok(
  $$insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
      valid_from, valid_until, pax_count, key_id)
    values ('00000000-0000-4000-8000-0000000000e5', (select id from public.booking_legs where booking_id = '00000000-0000-4000-8000-0000000000e1' limit 1),
            5, '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2N-05', pg_temp.days_from_today(28),
            pg_temp.jakarta_time(28, '07:00'), pg_temp.jakarta_time(28, '12:00'), 20, 'k1')$$,
  'P0001', 'a ticket is issued only for a paid booking with a settled payment', 'no ticket for an unpaid booking'
);
insert into public.tickets_qr (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
  valid_from, valid_until, pax_count, key_id)
select '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000e1', l.id, 5,
       '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2M-05', pg_temp.days_from_today(27),
       pg_temp.jakarta_time(27, '07:00'), pg_temp.jakarta_time(27, '12:00'), 40, 'k1'
from public.booking_legs l where l.booking_id = '00000000-0000-4000-8000-0000000000e1' and l.rw_id = 5;
select throws_ok(
  $$update public.tickets_qr set status = 'used', checked_in_at = now() where id = '00000000-0000-4000-8000-000000000201'$$,
  '42501', null, 'a ticket status is fenced'
);
select set_config('app.in_rpc', '1', true);
select lives_ok(
  $$update public.tickets_qr set status = 'used', checked_in_at = now() where id = '00000000-0000-4000-8000-000000000201'$$,
  'check-in marks it used'
);
select throws_ok(
  $$update public.tickets_qr set status = 'issued' where id = '00000000-0000-4000-8000-000000000201'$$,
  'P0001', 'a ticket that was used, revoked or expired is not issued again', 'a used ticket does not revive'
);
select set_config('app.undo_check_in', '1', true);
select lives_ok(
  $$update public.tickets_qr set status = 'issued', checked_in_at = null where id = '00000000-0000-4000-8000-000000000201'$$,
  'except through undo_check_in'
);
update public.tickets_qr set status = 'revoked', revoked_at = now() where id = '00000000-0000-4000-8000-000000000201';
select throws_ok(
  $$update public.tickets_qr set status = 'issued' where id = '00000000-0000-4000-8000-000000000201'$$,
  'P0001', null, 'undo_check_in cannot revive a revoked ticket'
);
select set_config('app.undo_check_in', '', true);
select throws_ok(
  $$update public.tickets_qr set ticket_code = 'GSK-7F3K9Q2M-08' where id = '00000000-0000-4000-8000-000000000201'$$,
  '42501', null, 'a ticket code never changes'
);
select set_config('app.in_rpc', '', true);

insert into public.certificates (id, booking_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
values ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-0000000000e1', 'group', 'SERT/GSK/2026/00001', 'CERTGROUP1', 'SD Negeri Gisikdrono 01', pg_temp.days_from_today(27), '{5}');
select throws_ok(
  $$update public.certificates set status = 'revoked', revoked_at = now() where id = '00000000-0000-4000-8000-000000000a01'$$,
  '42501', null, 'a certificate status is fenced'
);
select set_config('app.in_rpc', '1', true);
select lives_ok(
  $$update public.certificates set status = 'revoked', revoked_at = now() where id = '00000000-0000-4000-8000-000000000a01'$$,
  'revoke_certificate moves it'
);
select set_config('app.in_rpc', '', true);

-- ===== Price governance =====

insert into public.site_settings (key, value) values ('pricing.min_price_per_pax', '5000')
on conflict (key) do update set value = excluded.value;
select throws_ok(
  $$update public.tour_packages set price_per_pax = 1 where id = '00000000-0000-4000-8000-0000000000c1'$$,
  '23514', 'a price per visitor may not go below IDR 5000', 'a package cannot drop below the price floor'
);
select throws_ok(
  $$insert into public.tour_packages (rw_id, category, slug, name, price_per_pax)
    values (5, 'regular', 'paket-murah', 'Paket Murah', 4999)$$,
  '23514', null, 'nor start below it'
);

-- REC-13 for group prices: a flat price covers its largest group at the floor (review M1).
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, flat_price, min_pax, max_pax)
values ('00000000-0000-4000-8000-0000000000c6', 5, 'institutional', 'paket-rombongan', 'Paket Rombongan',
        'flat_group', 200000, 20, 40);
select throws_ok(
  $$update public.tour_packages set flat_price = 199999 where id = '00000000-0000-4000-8000-0000000000c6'$$,
  '23514', 'a group price for up to 40 visitors may not go below IDR 200000',
  'a group price below the floor for its largest group is refused'
);
select throws_ok(
  $$update public.tour_packages set max_pax = 41 where id = '00000000-0000-4000-8000-0000000000c6'$$,
  '23514', null, 'and so is taking a larger group than the price covers'
);
select throws_ok(
  $$insert into public.tour_packages (rw_id, category, slug, name, pricing_basis, flat_price, min_pax, max_pax)
    values (5, 'institutional', 'paket-satu-bus', 'Paket Satu Bus', 'flat_group', 5000, 1, 500)$$,
  '23514', null, 'a smallest group of one does not let one visitor''s floor pay for a full bus'
);
select throws_ok(
  $$update public.tour_packages set pricing_basis = 'flat_group', flat_price = 1
    where id = '00000000-0000-4000-8000-0000000000c1'$$,
  '23514', null, 'switching a per-visitor package to a flat price of IDR 1 is refused'
);
select lives_ok(
  $$update public.tour_packages set name = 'Paket Rombongan Sekolah' where id = '00000000-0000-4000-8000-0000000000c6'$$,
  'other edits of a group package pass'
);

select set_config('app.actor_id', '00000000-0000-4000-8000-000000000002', true);
update public.tour_packages set price_per_pax = 30000 where id = '00000000-0000-4000-8000-0000000000c1';
select set_config('app.actor_id', '', true);
select is(
  (select jsonb_agg(jsonb_build_object('old', old_price_per_pax, 'new', new_price_per_pax, 'by', changed_by) order by id)
   from public.package_price_history where package_id = '00000000-0000-4000-8000-0000000000c1'),
  '[{"old": 25000, "new": 30000, "by": "00000000-0000-4000-8000-000000000002"}]'::jsonb,
  'the history records the change and who made it'
);
select is(
  (select details from public.security_events where event_type = 'price_changed' and entity_id = '00000000-0000-4000-8000-0000000000c1'),
  '{"old_price_per_pax": 25000, "new_price_per_pax": 30000}'::jsonb,
  'a price change raises price_changed for the anomaly scan'
);

-- Basis and group size are price changes too (review M1).
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000002', true);
update public.tour_packages set min_pax = 1 where id = '00000000-0000-4000-8000-0000000000c6';
select set_config('app.actor_id', '', true);
select is(
  (select jsonb_build_object('min', jsonb_build_array(old_min_pax, new_min_pax), 'max', new_max_pax,
            'basis', new_pricing_basis, 'flat', new_flat_price, 'by', changed_by)
   from public.package_price_history where package_id = '00000000-0000-4000-8000-0000000000c6'),
  '{"min": [20, 1], "max": 40, "basis": "flat_group", "flat": 200000, "by": "00000000-0000-4000-8000-000000000002"}'::jsonb,
  'lowering the smallest group is a history entry, with the pricing it left in place'
);
select is(
  (select details from public.security_events where event_type = 'price_changed' and entity_id = '00000000-0000-4000-8000-0000000000c6'),
  '{"old_min_pax": 20, "new_min_pax": 1}'::jsonb,
  'and a price_changed event naming only what changed'
);
update public.tour_packages set pricing_basis = 'per_pax', price_per_pax = 6000, max_pax = 30
where id = '00000000-0000-4000-8000-0000000000c6';
select is(
  (select details from public.security_events where event_type = 'price_changed' and entity_id = '00000000-0000-4000-8000-0000000000c6'
   order by id desc limit 1),
  '{"old_pricing_basis": "flat_group", "new_pricing_basis": "per_pax", "new_price_per_pax": 6000,
    "old_max_pax": 40, "new_max_pax": 30}'::jsonb,
  'so is a change of basis and largest group'
);
update public.tour_packages set name = 'Eduwisata Ecowastreme', price_per_pax = 30000
where id = '00000000-0000-4000-8000-0000000000c1';
select is(
  (select count(*)::int from public.package_price_history where package_id = '00000000-0000-4000-8000-0000000000c1'),
  1,
  'saving other fields with an unchanged price adds nothing'
);

select throws_ok(
  $$insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
    values ('00000000-0000-4000-8000-0000000000c1', 50, null, 4000)$$,
  '23514', null, 'a volume tier cannot go below the floor either'
);
insert into public.tour_package_price_tiers (id, package_id, min_pax, max_pax, price_per_pax)
values ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-0000000000c1', 50, null, 20000);
select is(
  (select tier_id::text || ' ' || new_price_per_pax from public.package_price_history
   where package_id = '00000000-0000-4000-8000-0000000000c1' order by id desc limit 1),
  '00000000-0000-4000-8000-000000000c11 20000',
  'a new tier is recorded against the tier'
);
select lives_ok(
  $$delete from public.tour_package_price_tiers where id = '00000000-0000-4000-8000-000000000c11'$$,
  'a tier with history can still be removed'
);
select is(
  (select jsonb_agg(jsonb_build_object('tier', tier_id, 'old', old_price_per_pax, 'new', new_price_per_pax) order by id)
   from public.package_price_history
   where package_id = '00000000-0000-4000-8000-0000000000c1' and 20000 in (old_price_per_pax, new_price_per_pax)),
  '[{"tier": null, "old": null, "new": 20000}, {"tier": null, "old": 20000, "new": null}]'::jsonb,
  'the removal is recorded, and the older entry lets go of the deleted tier'
);
select throws_ok(
  $$update public.package_price_history set tier_id = gen_random_uuid()
    where package_id = '00000000-0000-4000-8000-0000000000c1' and new_price_per_pax = 30000$$,
  '42501', 'package_price_history.tier_id may only be cleared', 'but a history entry is never pointed at another tier'
);

update public.products_umkm set price = 12000 where id = '00000000-0000-4000-8000-0000000000d2';
select is(
  (select details from public.security_events where event_type = 'price_changed' and entity_id = '00000000-0000-4000-8000-0000000000d2'),
  '{"old_price": 10000, "new_price": 12000}'::jsonb,
  'a product price change raises price_changed as well'
);

-- 0005 (review of 0005, finding 3): the floor is never switched off. Its setting cannot be removed, and were it
-- missing all the same, a price write would fail rather than go unchecked.
select throws_ok(
  $$delete from public.site_settings where key = 'pricing.min_price_per_pax'$$,
  'P0001', 'site setting pricing.min_price_per_pax is required and cannot be removed',
  'the price floor''s setting cannot be removed'
);
alter table public.site_settings disable trigger site_settings_required_keys;
delete from public.site_settings where key = 'pricing.min_price_per_pax';
select throws_ok(
  $$update public.tour_packages set price_per_pax = 1000 where id = '00000000-0000-4000-8000-0000000000c1'$$,
  '55000', null, 'and without it no package price is written at all'
);
insert into public.site_settings (key, value) values ('pricing.min_price_per_pax', '5000');
alter table public.site_settings enable trigger site_settings_required_keys;

-- ===== Quota =====

insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, status) values
  ('00000000-0000-4000-8000-0000000000b5', 5, pg_temp.days_from_today(35), '08:00', '10:00', 'Sesi Pagi', 10, 'open'),
  ('00000000-0000-4000-8000-0000000000b8', 8, pg_temp.days_from_today(35), '13:00', '15:00', 'Sesi Siang', 10, 'open'),
  ('00000000-0000-4000-8000-0000000000b9', 5, pg_temp.days_from_today(36), '08:00', '10:00', 'Sesi Ditutup', 10, 'closed');
select lives_ok(
  $$select internal.reserve_session_quota('00000000-0000-4000-8000-0000000000b5', 6)$$,
  'a session with room takes the reservation'
);
select throws_ok(
  $$select internal.reserve_session_quota('00000000-0000-4000-8000-0000000000b5', 5)$$,
  'P0001', null, 'one visitor too many is refused'
);
select is(
  (select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000000b5'),
  6,
  'and the refused reservation took nothing'
);
select lives_ok(
  $$select internal.reserve_session_quota('00000000-0000-4000-8000-0000000000b5', 4)$$,
  'the last seats can be taken'
);
select throws_ok(
  $$select internal.reserve_session_quota('00000000-0000-4000-8000-0000000000b9', 1)$$,
  'P0001', null, 'a closed session takes no one'
);
select throws_ok(
  $$select internal.reserve_session_quota('00000000-0000-4000-8000-0000000000b8', 0)$$,
  '22023', null, 'a reservation needs at least one visitor'
);

-- A combo booking holding both legs gives its seats back once.
select internal.reserve_session_quota('00000000-0000-4000-8000-0000000000b8', 3);
select is(
  coalesce(current_setting('app.in_rpc', true), ''),
  '',
  'a transition puts the status fence back the way it found it, so nothing after it writes unfenced'
);
-- The booking and its legs start past their first state; this fixture plays create_booking.
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, expires_at)
values ('00000000-0000-4000-8000-0000000000e6', 'GSK-7F3K9Q2P', 'pending_payment', '00000000-0000-4000-8000-0000000000c1',
  '{}', '{5,8}', 'school', 'Dewi Lestari', '+6281234567892', 'dewi@example.test', 3,
  pg_temp.days_from_today(35), pg_temp.days_from_today(35), 75000, 75000, 'v1', now(), now() + interval '2 hours');
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at) values
  ('00000000-0000-4000-8000-0000000000e6', 5, '00000000-0000-4000-8000-0000000000b5', 1, 3, 'reserved', now()),
  ('00000000-0000-4000-8000-0000000000e6', 8, '00000000-0000-4000-8000-0000000000b8', 2, 3, 'reserved', now());
select lives_ok(
  $$select internal.release_booking_quota('00000000-0000-4000-8000-0000000000e6')$$,
  'releasing a booking gives back the seats of every leg'
);
select is(
  (select string_agg(id::text || '=' || reserved_pax, ' ' order by id) from public.visit_sessions
   where id in ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-0000000000b8')),
  '00000000-0000-4000-8000-0000000000b5=7 00000000-0000-4000-8000-0000000000b8=0',
  'each session drops by that leg''s visitors'
);
select is(
  (select count(*)::int from public.booking_legs
   where booking_id = '00000000-0000-4000-8000-0000000000e6' and status = 'released' and quota_released_at is not null),
  2,
  'and both legs are stamped released'
);
select internal.release_booking_quota('00000000-0000-4000-8000-0000000000e6');
select is(
  (select sum(reserved_pax)::int from public.visit_sessions
   where id in ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-0000000000b8')),
  7,
  'a second release changes nothing'
);
select set_config('app.in_rpc', '', true);

-- ===== Document numbers =====

select is(internal.next_document_number('invoice', '2026-10-31 23:30+07'), 'INV/GSK/2026/10/0001', 'the first invoice of a month is 0001');
select is(internal.next_document_number('invoice', '2026-10-31 23:40+07'), 'INV/GSK/2026/10/0002', 'the next one follows without a gap');
select is(
  internal.next_document_number('invoice', '2026-10-31 17:30+00'),
  'INV/GSK/2026/11/0001',
  'the month follows the Jakarta calendar, not UTC'
);
select is(internal.next_document_number('receipt', '2026-10-31 23:50+07'), 'KW/GSK/2026/10/0001', 'receipts count on their own');
select is(internal.next_document_number('quotation', '2026-10-15 10:00+07'), 'SP/GSK/2026/10/0001', 'so do quotations');
select is(internal.next_document_number('credit_note', '2026-10-15 10:00+07'), 'CN/GSK/2026/0001', 'credit notes count per year');
select is(internal.next_document_number('certificate', '2026-10-15 10:00+07'), 'SERT/GSK/2026/00001', 'certificates per year, five digits');
insert into public.document_sequences (kind, period, last_value) values ('quotation', '2026-12', 9999);
select is(
  internal.next_document_number('quotation', '2026-12-01 09:00+07'),
  'SP/GSK/2026/12/10000',
  'a busy month keeps counting past its digits instead of wrapping'
);
select throws_ok(
  $$select internal.next_document_number('invoice', null)$$,
  '22004', null, 'a number needs the time it is issued'
);

-- ===== Rate limits =====

select is(internal.rate_limit_hit('test:otp:hash-a', 2, 3600), true, 'the first hit is allowed');
select is(internal.rate_limit_hit('test:otp:hash-a', 2, 3600), true, 'so is the second, at the limit');
select is(internal.rate_limit_hit('test:otp:hash-a', 2, 3600), false, 'the third is over it');
select is(internal.rate_limit_hit('test:otp:hash-b', 2, 3600), true, 'another key has its own count');
select throws_ok(
  $$select internal.rate_limit_hit('test:otp:hash-a', 2, 0)$$,
  '22023', null, 'a window must be at least a second'
);

-- ===== Notification outbox =====

-- GUEST-08: nothing but the OTP goes to WhatsApp before the number is verified.
select is(
  internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'booking_created', 'whatsapp', '{}'),
  null,
  'a WhatsApp message to an unverified number is skipped'
);
select is(
  (select count(*)::int from public.notifications where booking_id = '00000000-0000-4000-8000-0000000000e5'),
  0,
  'and nothing is queued'
);
select isnt(
  internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'phone_otp', 'whatsapp', '{"otp_ref": "a1"}'),
  null,
  'the OTP that verifies the number is the exception'
);
select is(
  (select recipient || ' ' || recipient_name from public.notifications
   where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:phone_otp:whatsapp'),
  '+6281234567891 Budi',
  'and goes to the booking''s own number, greeting the first name only'
);
select throws_ok(
  $$insert into public.notifications (booking_id, channel, template, recipient, dedupe_key)
    values ('00000000-0000-4000-8000-0000000000e6', 'whatsapp', 'booking_created', '+6281234567892', 'direct:1')$$,
  '42501', 'WhatsApp goes only to a verified number', 'a direct insert cannot get around it'
);
update public.bookings set phone_verified_at = now() where id = '00000000-0000-4000-8000-0000000000e5';
select isnt(
  internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'booking_created', 'whatsapp', '{"link_scope": "manage"}'),
  null,
  'once verified, the number gets its manage link'
);
select is(
  internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'booking_created', 'whatsapp', '{"link_scope": "manage"}'),
  (select id from public.notifications where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp'),
  'queueing the same message twice returns the row already queued'
);

-- An email address nobody has confirmed gets view links only, whatever the caller asked for.
select lives_ok(
  $$select internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'booking_created', 'email', '{"link_scope": "manage"}')$$,
  'an unconfirmed email address is still told about the booking'
);
select is(
  (select params ->> 'link_scope' from public.notifications
   where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:email'),
  'view',
  'but with a view link instead of manage'
);
update public.bookings set email_verified_at = now() where id = '00000000-0000-4000-8000-0000000000e5';
select internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'payment_reminder', 'email', '{"link_scope": "pay"}');
select is(
  (select params ->> 'link_scope' from public.notifications
   where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:payment_reminder:email'),
  'pay',
  'a confirmed address gets the link it was sent'
);

select throws_ok(
  $$insert into public.notifications (booking_id, channel, template, recipient, dedupe_key)
    values ('00000000-0000-4000-8000-0000000000e5', 'email', 'booking_created', 'someone.else@example.test', 'direct:2')$$,
  '42501', null, 'a booking''s message never goes to another address'
);
select is(
  internal.enqueue_notification('00000000-0000-4000-8000-0000000000e1', 'review_invite', 'email', '{}'),
  null,
  'an anonymised booking has no one left to write to'
);
select lives_ok(
  $$insert into public.notifications (channel, template, recipient, params, dedupe_key)
    values ('email', 'security_alert', 'alerts@example.test', '{"severity": "high"}', 'alert:fingerprint-1')$$,
  'staff alerts, which belong to no booking, are queued as they are'
);

-- Refused text never fails the transaction that queues it, since a payment may be committing there: the
-- message is held as cancelled with its reason and reported (re-review of L7).
insert into public.notifications (booking_id, channel, template, recipient, params, dedupe_key) values
  ('00000000-0000-4000-8000-0000000000e5', 'email', 'review_invite', 'budi@example.test',
   '{"link": "https://gisikdrono.example/reservasi/GSK-7F3K9Q2N?t=abc"}', 'held:url'),
  ('00000000-0000-4000-8000-0000000000e5', 'whatsapp', 'review_invite', '+6281234567891', '{"note": "lihat www.contoh.id"}', 'held:www'),
  ('00000000-0000-4000-8000-0000000000e5', 'whatsapp', 'review_invite', '+6281234567891', '{"note": "bayar di gisikdrono.id/bayar"}', 'held:domain'),
  ('00000000-0000-4000-8000-0000000000e5', 'whatsapp', 'review_invite', '+6281234567891', '{"note": "bayar di gisik-bayar.top"}', 'held:host'),
  ('00000000-0000-4000-8000-0000000000e5', 'whatsapp', 'review_invite', '+6281234567891', '{"note": "bayar di 103.20.1.5/bayar"}', 'held:ip'),
  ('00000000-0000-4000-8000-0000000000e5', 'whatsapp', 'review_invite', '+6281234567891', '{"note": "S.Pd.com"}', 'held:title-host'),
  ('00000000-0000-4000-8000-0000000000e5', 'whatsapp', 'review_invite', '+6281234567891', '{"link_scope": "admin"}', 'held:scope');
select is(
  (select string_agg(dedupe_key || '=' || status || '/' || last_error_code, ' ' order by dedupe_key)
   from public.notifications where dedupe_key like 'held:%'),
  'held:domain=cancelled/blocked_params_link held:host=cancelled/blocked_params_link '
    || 'held:ip=cancelled/blocked_params_link held:scope=cancelled/blocked_unknown_link_scope '
    || 'held:title-host=cancelled/blocked_params_link held:url=cancelled/blocked_params_link '
    || 'held:www=cancelled/blocked_params_link',
  'a link, any name.tld host, an IP address or an unknown link scope holds the message as cancelled, with the reason'
);
select is(
  (select count(*)::int from public.security_events e join public.notifications n on n.id::text = e.entity_id
   where e.event_type = 'notification_blocked' and n.dedupe_key like 'held:%'),
  7,
  'and every held message is reported as notification_blocked'
);
select isnt(
  internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'review_invite', 'whatsapp', '{"note": "bayar di gisik-bayar.top"}'),
  null,
  'enqueue_notification does not raise either; it returns the held message'
);

-- Indonesian academic titles are not hosts.
insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
values ('00000000-0000-4000-8000-0000000000e5', 'whatsapp', 'checked_in_thanks', '+6281234567891', 'Ani Lestari, S.Pd.',
        '{"guide": "Budi S.Si", "head": "Dra. Rina M.Sc", "institution": "Univ.Diponegoro",
          "session": "08.00-10.00 WIB", "total": "Rp 1.250.000"}', 'titles:1');
select is(
  (select status::text from public.notifications where dedupe_key = 'titles:1'),
  'queued',
  'names and institutions with academic titles, times and amounts with dots are queued as they are'
);

update public.notifications set recipient_name = 'klik evil.shop'
where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp';
select is(
  (select status || '/' || last_error_code from public.notifications
   where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp'),
  'cancelled/blocked_recipient_name_link',
  'the greeting name is checked too, on an update as well'
);
update public.notifications set status = 'queued' where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp';
select is(
  (select status::text from public.notifications where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp'),
  'cancelled',
  'a held message cannot be queued again while its text is refused'
);
update public.notifications set recipient_name = 'Budi', status = 'queued', last_error_code = null, last_error = null
where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp';
select is(
  (select status::text from public.notifications where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp'),
  'queued',
  'once its text is clean it can'
);
select throws_ok(
  $$update public.notifications set recipient = '+6289999999999'
    where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:whatsapp'$$,
  '42501', 'a booking''s message goes only to that booking''s own contact',
  'an update cannot point a queued message at another number'
);
update public.bookings set pic_email = 'alamat.baru@example.test' where id = '00000000-0000-4000-8000-0000000000e5';
select lives_ok(
  $$update public.notifications set params = '{}'
    where dedupe_key = 'booking:00000000-0000-4000-8000-0000000000e5:booking_created:email'$$,
  'while emptying old params, as the prune does, works even after the booking''s contact changed'
);
update public.bookings set pic_email = 'budi@example.test' where id = '00000000-0000-4000-8000-0000000000e5';

-- A settlement commits even when the booker's name would put a host in the greeting: the booking is paid
-- and its ticket issued, and only the messages are held. These are the steps internal.apply_payment_event
-- (P3.8.02) will take; its own pgTAP repeats this case.
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, expires_at, phone_verified_at, email_verified_at)
values ('00000000-0000-4000-8000-0000000003b1', 'GSK-SETT1E01', 'pending_payment', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school',
  'gisik-bayar.top Budi', '+6281234567301', 'settle@example.test', 2, pg_temp.days_from_today(27),
  pg_temp.days_from_today(27), 100000, 100000, 'v1', now(), now() + interval '2 hours', now(), now());
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
values ('00000000-0000-4000-8000-0000000003b1', 5, '00000000-0000-4000-8000-0000000000b1', 1, 2, 'reserved', now());
insert into public.payments (id, booking_id, attempt_no, provider, order_id, gross_amount, status)
values ('00000000-0000-4000-8000-0000000003b2', '00000000-0000-4000-8000-0000000003b1', 1, 'midtrans', 'GSK-SETT1E01-01', 100000, 'pending');
select set_config('app.in_rpc', '', true);
select lives_ok(
  $q$do $settle$
    begin
      perform set_config('app.in_rpc', '1', true);
      update public.payments set status = 'settled', settlement_time = now() where id = '00000000-0000-4000-8000-0000000003b2';
      update public.bookings set status = 'paid', paid_at = now(), amount_paid = 100000 where id = '00000000-0000-4000-8000-0000000003b1';
      insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
        valid_from, valid_until, pax_count, key_id)
      select l.booking_id, l.id, 5, l.visit_session_id, 'GSK-SETT1E01-05', pg_temp.days_from_today(27),
             pg_temp.jakarta_time(27, '07:00'), pg_temp.jakarta_time(27, '12:00'), 2, 'k1'
      from public.booking_legs l where l.booking_id = '00000000-0000-4000-8000-0000000003b1';
      perform internal.enqueue_notification('00000000-0000-4000-8000-0000000003b1', 'payment_received_ticket', 'whatsapp', '{"link_scope": "view"}');
      perform internal.enqueue_notification('00000000-0000-4000-8000-0000000003b1', 'payment_received_ticket', 'email', '{"link_scope": "view"}');
      perform set_config('app.in_rpc', '', true);
    end
  $settle$$q$,
  'the settlement runs through although the booker''s name holds a host'
);
select is(
  (select b.status || ' ' || (select count(*) from public.tickets_qr t where t.booking_id = b.id and t.status = 'issued')
   from public.bookings b where b.id = '00000000-0000-4000-8000-0000000003b1'),
  'paid 1',
  'the booking is paid and its ticket issued'
);
select is(
  (select string_agg(channel || '=' || status || '/' || last_error_code, ' ' order by channel) from public.notifications
   where booking_id = '00000000-0000-4000-8000-0000000003b1'),
  'whatsapp=cancelled/blocked_recipient_name_link email=cancelled/blocked_recipient_name_link',
  'only the ticket messages are held, with the reason'
);
select is(
  (select count(*)::int from public.security_events
   where event_type = 'notification_blocked' and details ->> 'booking_id' = '00000000-0000-4000-8000-0000000003b1'),
  2,
  'and reported for a person to look at'
);

-- ===== Scheduled jobs =====
-- Fixtures are dated relative to today and start at 05:xx, so they never collide with the fixed-date
-- sessions above. The jobs touch every row, so the assertions look at these rows only.

insert into public.site_settings (key, value) values ('booking.quotation_valid_days', '14'), ('pii_retention_months', '24')
on conflict (key) do update set value = excluded.value;
select set_config('app.in_rpc', '1', true);
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, reserved_pax) values
  ('00000000-0000-4000-8000-000000001b01', 5, public.today_jkt() - 3, '05:00', '06:00', 'Lampau', 40, 0),
  ('00000000-0000-4000-8000-000000001b02', 5, public.today_jkt() + 1, '05:10', '06:00', 'Besok', 40, 0),
  ('00000000-0000-4000-8000-000000001b03', 5, public.today_jkt() + 10, '05:20', '06:00', 'Nanti', 20, 4),
  ('00000000-0000-4000-8000-000000001b04', 5, public.today_jkt() + 5, '05:30', '06:00', 'Terlalu tinggi', 10, 5),
  ('00000000-0000-4000-8000-000000001b05', 8, public.today_jkt() + 5, '05:40', '06:00', 'Terlalu rendah', 10, 0);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, expires_at, phone_verified_at, paid_at, amount_paid, created_at)
select ('00000000-0000-4000-8000-00000000' || code)::uuid, 'GSK-J0B0' || upper(code), status::public.booking_status,
  '00000000-0000-4000-8000-0000000000c1', '{}', rw_ids::smallint[], 'school', 'Guru ' || code, '+6281234500' || right(code, 2),
  'guru' || code || '@example.test', 4, visit, visit, 100000, 100000, 'v1', now(), expires, verified,
  case when status in ('paid', 'checked_in') then now() - interval '5 days' end,
  case when status in ('paid', 'checked_in') then 100000 else 0 end, created
from (values
  ('1e01', 'pending_payment', '{5}', public.today_jkt() + 10, now() - interval '10 minutes', now(), now()),
  ('1e02', 'pending_payment', '{8}', public.today_jkt() + 5, now() - interval '2 minutes', null::timestamptz, now()),
  ('1e03', 'quoted', '{5}', public.today_jkt() + 20, null, null, now() - interval '30 days'),
  ('1e04', 'checked_in', '{5}', public.today_jkt() - 3, null, now(), now() - interval '10 days'),
  ('1e05', 'paid', '{5}', public.today_jkt() - 3, null, now(), now() - interval '10 days'),
  ('1e06', 'paid', '{5}', public.today_jkt() + 1, null, now(), now() - interval '10 days')
) as fixture(code, status, rw_ids, visit, expires, verified, created);
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at) values
  ('00000000-0000-4000-8000-000000001e01', 5, '00000000-0000-4000-8000-000000001b03', 1, 4, 'reserved', now()),
  ('00000000-0000-4000-8000-000000001e02', 8, '00000000-0000-4000-8000-000000001b05', 1, 2, 'reserved', now()),
  ('00000000-0000-4000-8000-000000001e04', 5, '00000000-0000-4000-8000-000000001b01', 1, 4, 'checked_in', now()),
  ('00000000-0000-4000-8000-000000001e05', 5, '00000000-0000-4000-8000-000000001b01', 1, 4, 'reserved', now()),
  ('00000000-0000-4000-8000-000000001e06', 5, '00000000-0000-4000-8000-000000001b02', 1, 4, 'reserved', now());
insert into public.payments (id, booking_id, attempt_no, provider, order_id, gross_amount, status) values
  ('00000000-0000-4000-8000-000000001f01', '00000000-0000-4000-8000-000000001e01', 1, 'midtrans', 'GSK-J0B01E01-01', 100000, 'pending'),
  ('00000000-0000-4000-8000-000000001f05', '00000000-0000-4000-8000-000000001e05', 1, 'midtrans', 'GSK-J0B01E05-01', 100000, 'settled');
insert into public.tickets_qr (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
  valid_from, valid_until, pax_count, key_id)
select '00000000-0000-4000-8000-000000001d05', l.booking_id, l.id, 5, l.visit_session_id, 'GSK-J0B01E05-05',
  public.today_jkt() - 3, now() - interval '3 days 2 hours', now() - interval '3 days', 4, 'k1'
from public.booking_legs l where l.booking_id = '00000000-0000-4000-8000-000000001e05';

-- Two lapsed holds that would once have stopped the whole run: 1e15 holds 4 seats of a session whose
-- counter has drifted down to 2, and 1e16 hits an error that a test trigger plants below.
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, reserved_pax) values
  ('00000000-0000-4000-8000-000000001b07', 5, public.today_jkt() + 12, '05:55', '06:30', 'Melenceng', 10, 2);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, expires_at)
values
  ('00000000-0000-4000-8000-000000001e15', 'GSK-J0B01E15', 'pending_payment', '00000000-0000-4000-8000-0000000000c1',
   '{}', '{5}', 'school', 'Guru Lima Belas', '+628123450015', 'guru15@example.test', 4, public.today_jkt() + 12,
   public.today_jkt() + 12, 100000, 100000, 'v1', now(), now() - interval '10 minutes'),
  ('00000000-0000-4000-8000-000000001e16', 'GSK-J0B01E16', 'pending_payment', '00000000-0000-4000-8000-0000000000c1',
   '{}', '{5}', 'school', 'Guru Enam Belas', '+628123450016', 'guru16@example.test', 4, public.today_jkt() + 12,
   public.today_jkt() + 12, 100000, 100000, 'v1', now(), now() - interval '10 minutes');
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
values ('00000000-0000-4000-8000-000000001e15', 5, '00000000-0000-4000-8000-000000001b07', 1, 4, 'reserved', now());
select set_config('app.in_rpc', '', true);
create function public.test_fail_one_expiry() returns trigger
  language plpgsql
as $$
begin
  if new.booking_id = '00000000-0000-4000-8000-000000001e16' then
    raise exception 'a planted failure for one booking';
  end if;
  return new;
end;
$$;
create trigger test_fail_one_expiry before insert on public.booking_events
  for each row execute function public.test_fail_one_expiry();

select internal.expire_stale_bookings();
drop trigger test_fail_one_expiry on public.booking_events;
drop function public.test_fail_one_expiry();
select is(
  (select status::text from public.bookings where id = '00000000-0000-4000-8000-000000001e16')
  || ' ' || (select details ->> 'job' from public.security_events
             where event_type = 'cron_failed' and entity_id = '00000000-0000-4000-8000-000000001e16'),
  'pending_payment expire_stale_bookings',
  'a booking that fails is rolled back on its own and reported as cron_failed, to be tried again'
);
select is(
  (select status::text from public.bookings where id = '00000000-0000-4000-8000-000000001e15')
  || ' ' || (select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-000000001b07'),
  'expired 0',
  'while the others still expire, and a drifted counter is floored at zero instead of failing the release'
);
select is(
  (select metadata - 'audit_mode' from public.audit_logs
   where action = 'quota.drift' and entity_id = '00000000-0000-4000-8000-000000001b07'),
  '{"stored": 2, "released": 4, "corrected": true, "source": "release_booking_quota"}'::jsonb,
  'and the drift is logged for a person to look at'
);
select is(
  coalesce(current_setting('app.in_rpc', true), '') || '/' || coalesce(current_setting('app.actor_role', true), ''),
  '/',
  'a job puts the status fence and its cron actor back when it is done'
);
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(
  (select string_agg(b.booking_code || '=' || b.status, ' ' order by b.booking_code) from public.bookings b
   where b.id in ('00000000-0000-4000-8000-000000001e01', '00000000-0000-4000-8000-000000001e02',
                  '00000000-0000-4000-8000-000000001e03')),
  'GSK-J0B01E01=expired GSK-J0B01E02=pending_payment GSK-J0B01E03=expired',
  'a lapsed hold and a lapsed quotation expire; a hold two minutes past its deadline gets its grace'
);
select is(
  (select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-000000001b03'),
  0,
  'the expired hold gives its seats back'
);
select is(
  (select status::text from public.payments where id = '00000000-0000-4000-8000-000000001f01'),
  'expired',
  'and its open payment expires with it'
);
select is(
  (select string_agg(reason, ' ' order by reason) from public.booking_events
   where booking_id in ('00000000-0000-4000-8000-000000001e01', '00000000-0000-4000-8000-000000001e03')
     and to_status = 'expired' and actor_type = 'cron'),
  'hold_lapsed quotation_lapsed',
  'each expiry lands in the booking timeline with its reason'
);
select is(
  (select string_agg(channel::text, ' ' order by channel) from public.notifications
   where booking_id = '00000000-0000-4000-8000-000000001e01' and template = 'booking_expired'),
  'whatsapp email',
  'and the visitor is told on both channels'
);

select internal.close_past_bookings();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(
  (select string_agg(booking_code || '=' || status, ' ' order by booking_code) from public.bookings
   where id in ('00000000-0000-4000-8000-000000001e04', '00000000-0000-4000-8000-000000001e05')),
  'GSK-J0B01E04=completed GSK-J0B01E05=no_show',
  'after the visit day a group that came is completed and one that never came is a no-show'
);
select is(
  (select jsonb_object_agg(channel, params ->> 'link_scope') from public.notifications
   where booking_id = '00000000-0000-4000-8000-000000001e04' and template = 'review_invite'),
  '{"whatsapp": "review", "email": "view"}'::jsonb,
  'the review invite carries a review link on the verified number, a view link to the unconfirmed email'
);
select is(
  (select status::text from public.tickets_qr where id = '00000000-0000-4000-8000-000000001d05'),
  'expired',
  'a ticket past its window expires'
);

select internal.enqueue_visit_reminders();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(
  (select string_agg(b.booking_code, ' ' order by b.booking_code) from public.notifications n
   join public.bookings b on b.id = n.booking_id
   where n.template = 'visit_reminder_d1' and n.channel = 'whatsapp' and b.booking_code like 'GSK-J0B0%'),
  'GSK-J0B01E06',
  'only the paid booking visiting tomorrow is reminded'
);

select internal.reconcile_session_counters();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(
  (select string_agg(label || '=' || reserved_pax, ' ' order by label) from public.visit_sessions
   where id in ('00000000-0000-4000-8000-000000001b04', '00000000-0000-4000-8000-000000001b05')),
  'Terlalu rendah=0 Terlalu tinggi=0',
  'a counter that is too high is corrected; one that is too low is left alone'
);
select is(
  (select jsonb_agg(metadata - 'audit_mode' order by entity_id) from public.audit_logs
   where action = 'quota.drift'
     and entity_id in ('00000000-0000-4000-8000-000000001b04', '00000000-0000-4000-8000-000000001b05')),
  '[{"stored": 5, "held": 0, "corrected": true}, {"stored": 0, "held": 2, "corrected": false}]'::jsonb,
  'both drifts are logged for a person to look at'
);

-- ===== Retention =====

select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, paid_at, amount_paid, expired_at, notes, source_ip, admin_notes, cancel_reason, review_reason,
  discount_note)
select ('00000000-0000-4000-8000-00000000' || code)::uuid, 'GSK-R0B0' || upper(code), status::public.booking_status,
  '00000000-0000-4000-8000-0000000000c1', '{}', '{5}', 'school', 'Kepala ' || code, '+6281234600' || right(code, 2),
  'kepala' || code || '@example.test', 4, visit, visit, 100000, 100000, 'v1', now(), paid,
  case when paid is null then 0 else 100000 end, expired, 'Mohon kursi roda untuk Bu Ani', '10.0.0.1',
  'Pak Budi minta dihubungi sore', 'Dibatalkan oleh Bu Ani', 'Ditinjau atas permintaan Pak Budi',
  'Potongan untuk rombongan Bu Ani'
from (values
  ('1e07', 'completed', public.today_jkt() - 100, now() - interval '101 days', null::timestamptz),
  ('1e08', 'expired', public.today_jkt() + 30, null, now() - interval '8 days'),
  ('1e09', 'expired', public.today_jkt() + 30, null, now() - interval '2 days'),
  ('1e10', 'completed', (public.today_jkt() - interval '25 months')::date, now() - interval '26 months', null)
) as fixture(code, status, visit, paid, expired);
select set_config('app.in_rpc', '', true);
insert into public.booking_participants (id, booking_id, seq_no, full_name, role_label) values
  ('00000000-0000-4000-8000-000000001c01', '00000000-0000-4000-8000-000000001e07', 1, 'Rina Wulandari', 'student'),
  ('00000000-0000-4000-8000-000000001c02', '00000000-0000-4000-8000-000000001e07', 2, 'Joko Susilo', 'student'),
  ('00000000-0000-4000-8000-000000001c03', '00000000-0000-4000-8000-000000001e08', 1, 'Tari Puspita', 'student');
insert into public.booking_addons (booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty,
  line_total, notes)
select ('00000000-0000-4000-8000-00000000' || code)::uuid, '00000000-0000-4000-8000-0000000000d2', 5,
       '00000000-0000-4000-8000-0000000000d1', 'Keripik', 10000, 1, 10000, 'Antar ke Bu Ani di aula'
from unnest(array['1e07', '1e08', '1e10']) as code;
insert into public.certificates (id, booking_id, participant_id, kind, certificate_number, verify_code, recipient_name, visit_date, rw_ids)
values ('00000000-0000-4000-8000-000000001a07', '00000000-0000-4000-8000-000000001e07', '00000000-0000-4000-8000-000000001c01',
        'participant', 'SERT/GSK/2026/00907', 'R7PXRGE001', 'Rina Wulandari', public.today_jkt() - 100, '{5}');
insert into public.exports (id, kind, format, requested_by, watermark, expires_at)
values ('00000000-0000-4000-8000-000000001a08', 'attendance', 'xlsx', '00000000-0000-4000-8000-000000000001', 'uji', now() - interval '1 hour');
select internal.enqueue_notification('00000000-0000-4000-8000-000000001e08', 'booking_expired', 'email', '{}');
insert into public.guest_otps (id, purpose, phone, code_hash, expires_at) values
  ('00000000-0000-4000-8000-000000001a09', 'booking_phone', '+6281234609999', 'hash-old', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000001a10', 'booking_phone', '+6281234609998', 'hash-new', now() + interval '5 minutes');

select internal.purge_participants();
select is(
  coalesce(current_setting('app.purge', true), '') || '/' || coalesce(current_setting('app.audit_mode', true), ''),
  '/',
  'a retention run puts the purge switch and the audit mode back when it is done'
);
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is(
  (select count(*)::int from public.booking_participants where booking_id = '00000000-0000-4000-8000-000000001e07'),
  0,
  'participant names go 90 days after the visit'
);
select is(
  (select jsonb_build_object('participant', participant_id, 'name', recipient_name, 'purged', purged_at is not null)
   from public.certificates where id = '00000000-0000-4000-8000-000000001a07'),
  '{"participant": null, "name": "[dihapus]", "purged": true}'::jsonb,
  'their certificates keep the number but lose the name, marked for purge-storage'
);
select is(
  (select deleted_at is not null from public.exports where id = '00000000-0000-4000-8000-000000001a08'),
  true,
  'an expired export is marked for purge-storage'
);
select is(
  (select metadata ->> 'job' from public.audit_logs where action = 'purge_run' and metadata ->> 'job' = 'purge_participants'),
  'purge_participants',
  'the run leaves one purge_run row with its counts'
);

-- 0005 (review of 0005, finding 3): without its retention setting the run stops instead of keeping every contact.
alter table public.site_settings disable trigger site_settings_required_keys;
delete from public.site_settings where key = 'pii_retention_months';
select throws_ok($$select internal.anonymise_booker_pii()$$, '55000', null,
  'without pii_retention_months the anonymisation run fails instead of keeping every contact');
insert into public.site_settings (key, value) values ('pii_retention_months', '24');
alter table public.site_settings enable trigger site_settings_required_keys;

select internal.anonymise_booker_pii();
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is(
  (select string_agg(booking_code || '=' || pic_name || '/' || coalesce(pic_phone, '-') || '/' || coalesce(notes, '-')
                     || '/' || coalesce(host(source_ip), '-') || '/' || token_version, ' ' order by booking_code)
   from public.bookings where booking_code like 'GSK-R0B0%'),
  'GSK-R0B01E07=Kepala 1e07/+628123460007/Mohon kursi roda untuk Bu Ani/10.0.0.1/1 '
  || 'GSK-R0B01E08=anon/-/-/-/2 '
  || 'GSK-R0B01E09=Kepala 1e09/+628123460009/Mohon kursi roda untuk Bu Ani/10.0.0.1/1 '
  || 'GSK-R0B01E10=anon/-/-/-/2',
  'unpaid bookings lose the contact a week after expiry, every booking 24 months after the visit, and their links stop working'
);
select is(
  (select count(*)::int from public.booking_participants where booking_id = '00000000-0000-4000-8000-000000001e08')
  + (select count(*)::int from public.notifications where booking_id = '00000000-0000-4000-8000-000000001e08'),
  0,
  'the participants and queued messages of an anonymised unpaid booking go with it'
);
select is(
  (select string_agg(code_hash, ' ') from public.guest_otps
   where id in ('00000000-0000-4000-8000-000000001a09', '00000000-0000-4000-8000-000000001a10')),
  'hash-new',
  'an OTP row is deleted the day after it expired'
);
select is(
  (select string_agg(booking_code || '=' || coalesce(admin_notes, '-') || '/' || coalesce(cancel_reason, '-') || '/'
                     || coalesce(review_reason, '-') || '/' || coalesce(discount_note, '-'), ' ' order by booking_code)
   from public.bookings where booking_code in ('GSK-R0B01E08', 'GSK-R0B01E10')),
  'GSK-R0B01E08=-/-/-/- GSK-R0B01E10=-/-/-/-',
  'staff notes and the cancel, review and discount reasons go too, even on a paid booking'
);
select is(
  (select string_agg(right(booking_id::text, 4) || '=' || coalesce(notes, '-'), ' ' order by booking_id)
   from public.booking_addons
   where booking_id in ('00000000-0000-4000-8000-000000001e07', '00000000-0000-4000-8000-000000001e08',
                        '00000000-0000-4000-8000-000000001e10')),
  '1e07=Antar ke Bu Ani di aula 1e08=- 1e10=-',
  'and so do the notes the visitor left on their add-ons (review of 0005, L3)'
);

-- Document snapshots keep to the one shape of docs/PRD.md §8.4.5 and name the institution, never a
-- person or a way to reach one (review M7).
select throws_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-000000001e07', 'INV/GSK/2026/10/0101', 100000, '{"pic": "Budi Santoso"}')$$,
  '23514', 'invoices.snapshot: unknown key pic',
  'a key outside the document shape is refused, whatever it is called'
);
select throws_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-000000001e07', 'INV/GSK/2026/10/0102', 100000,
            '{"lines": [{"product_name": "Paket Eduwisata", "kontak": "Bu Ani"}]}')$$,
  '23514', 'invoices.snapshot: unknown key lines.kontak', 'at any depth'
);
select throws_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-000000001e07', 'INV/GSK/2026/10/0102', 100000,
            '{"institution_name": "SD Negeri 1, hubungi 0812-3456-7890"}')$$,
  '23514', 'invoices.snapshot: institution_name looks like an email address or a phone number',
  'a phone number inside an allowed field is refused'
);
select throws_ok(
  $$update public.quotations set snapshot = '{"lines": [{"product_name": "Kirim ke ani@example.test"}]}'
    where quotation_number = 'SP/GSK/2026/10/0001'$$,
  '23514', 'quotations.snapshot: lines.product_name looks like an email address or a phone number',
  'and so is an email address, in a quotation too'
);
select throws_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-000000001e07', 'INV/GSK/2026/10/0102', 100000, '{"total_amount": 6281234567890}')$$,
  '23514', null, 'even a phone number written as a number'
);
select throws_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-000000001e07', 'INV/GSK/2026/10/0102', 100000,
            jsonb_build_object('institution_name', repeat('x', 301)))$$,
  '23514', 'invoices.snapshot: institution_name is longer than 300 characters', 'and so is free text past 300 characters'
);
select throws_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-000000001e07', 'INV/GSK/2026/10/0102', 100000, '{"sessions": "pagi"}')$$,
  '23514', 'invoices.snapshot: sessions must be an object', 'a section keeps its own shape'
);
select lives_ok(
  $$insert into public.invoices (booking_id, invoice_number, amount_due, snapshot)
    values ('00000000-0000-4000-8000-000000001e07', 'INV/GSK/2026/10/0103', 100000, '{
      "booking_code": "GSK-08123456", "institution_name": "SD Negeri 1 Gisikdrono", "booker_type": "school",
      "package_name": "Eduwisata Ecowastreme", "rw_names": ["RW 05 Ecowastreme"], "visit_date": "2026-11-02",
      "sessions": [{"rw_name": "RW 05", "session_date": "2026-11-02", "start_time": "08:00", "end_time": "10:00"}],
      "pax_count": 4, "lines": [{"kind": "package", "product_name": "Eduwisata Ecowastreme", "qty": 4,
      "unit_price": 25000, "line_total": 100000}], "total_amount": 100000, "currency": "IDR",
      "payment": {"method": "qris", "order_id": "GSK-08123456-01", "paid_at": "2026-10-20T09:15:00+07:00"},
      "credit_note": {"number": "CN/GSK/2026/0812", "amount": 100000},
      "signatory_name": "Lurah Gisikdrono", "signatory_title": "Lurah"}')$$,
  'the document fields pass, codes, numbers and times included'
);
select is(
  (select before is null and after is null and metadata -> 'changed_columns' ? 'pic_phone' from public.audit_logs
   where action = 'bookings.update' and entity_id = '00000000-0000-4000-8000-000000001e08' order by id desc limit 1),
  true,
  'the anonymisation is audited by column name only'
);

-- ===== Storage purge support =====
-- What the retention runs above marked, with a file each, next to live files that must stay.

update public.bookings set ticket_pdf_path = 'bookings/1e10/ticket-GSK-R0B01E10.pdf'
where id = '00000000-0000-4000-8000-000000001e10';
update public.bookings set ticket_pdf_path = 'bookings/1e07/ticket-GSK-R0B01E07.pdf'
where id = '00000000-0000-4000-8000-000000001e07';
update public.certificates set pdf_path = 'certificates/1e07/participant-1.pdf'
where id = '00000000-0000-4000-8000-000000001a07';
update public.certificates set pdf_path = 'certificates/e1/group.pdf' where id = '00000000-0000-4000-8000-000000000a01';
update public.exports set storage_path = 'exports/0001/attendance-1.xlsx' where id = '00000000-0000-4000-8000-000000001a08';
insert into public.exports (id, kind, format, requested_by, watermark, expires_at, storage_path)
values ('00000000-0000-4000-8000-000000001a11', 'visits', 'xlsx', '00000000-0000-4000-8000-000000000001', 'uji',
        now() + interval '1 hour', 'exports/0001/visits-live.xlsx');

select is(
  (select string_agg(bucket || ':' || path, ' ' order by path) from public.svc_purgeable_files(100)),
  'documents:bookings/1e10/ticket-GSK-R0B01E10.pdf documents:certificates/1e07/participant-1.pdf '
  || 'documents:exports/0001/attendance-1.xlsx',
  'the job is handed the purged certificate, the expired export and the ticket PDF a year past its visit'
);
select is(
  public.svc_forget_purged_files(array[
    'certificates/1e07/participant-1.pdf', 'exports/0001/attendance-1.xlsx', 'bookings/1e10/ticket-GSK-R0B01E10.pdf',
    'certificates/e1/group.pdf', 'exports/0001/visits-live.xlsx', 'bookings/1e07/ticket-GSK-R0B01E07.pdf']),
  3,
  'after deleting the files the job clears exactly the three marked paths'
);
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is((select count(*)::int from public.svc_purgeable_files(100)), 0, 'so the next run finds nothing left');
select is(
  (select pdf_path from public.certificates where id = '00000000-0000-4000-8000-000000000a01') || ' '
  || (select storage_path from public.exports where id = '00000000-0000-4000-8000-000000001a11') || ' '
  || (select ticket_pdf_path from public.bookings where id = '00000000-0000-4000-8000-000000001e07'),
  'certificates/e1/group.pdf exports/0001/visits-live.xlsx bookings/1e07/ticket-GSK-R0B01E07.pdf',
  'live files named in the same list keep their paths'
);
select is(
  (select actor_role from public.audit_logs
   where action = 'certificates.update' and entity_id = '00000000-0000-4000-8000-000000001a07' order by id desc limit 1),
  'cron',
  'and clearing a path is logged as the job'
);

-- ===== Session generation, UI events, booklet downloads =====

-- 0005 grants these two to authenticated; the test grants them for itself until then.
grant execute on function public.generate_visit_sessions(smallint, date, date), public.rpc_log_ui_event(text, uuid)
  to authenticated;
insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity, is_active) values
  (8, extract(dow from public.today_jkt() + 1)::smallint, 'Subuh', '04:00', '04:45', 30, true),
  (8, extract(dow from public.today_jkt() + 1)::smallint, 'Libur', '04:30', '04:50', 30, false);

-- Profile 0002 is the RW 08 admin by now (the guard tests moved it).
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role,
                            'app_rw_id', rw_id, 'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
-- The development seed has RW 08 templates of its own, so the checks count this suite's template only.
select lives_ok($$select public.generate_visit_sessions(8::smallint, public.today_jkt(), public.today_jkt() + 13)$$,
  'an RW admin generates their RW''s sessions');
select is(
  (select count(*)::int from public.visit_sessions where rw_id = 8 and label = 'Subuh' and start_time = '04:00'),
  2,
  'turning the active template into two weeks of sessions'
);
select lives_ok($$select public.generate_visit_sessions(8::smallint, public.today_jkt(), public.today_jkt() + 13)$$,
  'running it again');
select is(
  (select count(*)::int from public.visit_sessions where rw_id = 8 and label = 'Subuh' and start_time = '04:00'),
  2,
  'creates nothing new'
);
select throws_ok(
  $$select public.generate_visit_sessions(5::smallint, public.today_jkt(), public.today_jkt() + 13)$$,
  '42501', null, 'but not for another RW'
);
select throws_ok(
  $$select public.generate_visit_sessions(8::smallint, public.today_jkt(), public.today_jkt() + 400)$$,
  '22023', null, 'and at most a year ahead'
);
select lives_ok($$select public.rpc_log_ui_event('scanner_opened', null)$$, 'staff log opening the scanner');
select throws_ok(
  $$select public.rpc_log_ui_event('export_downloaded', null)$$,
  '22023', null, 'but no event outside the two the browser may write'
);
reset role;
select is(
  (select string_agg(label || ' ' || (created_by = '00000000-0000-4000-8000-000000000002')::text, ', ')
   from public.visit_sessions where rw_id = 8 and start_time in ('04:00', '04:30')),
  'Subuh true, Subuh true',
  'only the active template is used, and the sessions record who generated them'
);
select lives_ok(
  $$select public.generate_visit_sessions(5::smallint, public.today_jkt(), public.today_jkt() + 180)$$,
  'the nightly job may generate for any RW'
);
select is(
  (select jsonb_build_object('actor', actor_id, 'role', actor_role, 'entity', entity_type, 'metadata', metadata)
   from public.audit_logs where action = 'ui.scanner_opened'),
  '{"actor": "00000000-0000-4000-8000-000000000002", "role": "admin_rw", "entity": "scanner", "metadata": {"source": "client"}}'::jsonb,
  'the UI event is logged under the signed-in user, marked as coming from the browser'
);

update public.rate_limit_buckets set count = 600 where key = 'ui_event:00000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok(
  $$select public.rpc_log_ui_event('pii_revealed', '00000000-0000-4000-8000-0000000000e5')$$,
  'P0001', 'too many UI events this hour', 'the 601st event in an hour is refused'
);
reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok(
  $$select public.rpc_log_ui_event('scanner_opened', null)$$,
  '42501', null, 'a signed-in non-staff user logs nothing'
);
reset role;
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal1', 'app_role', role,
                            'app_rw_id', rw_id, 'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select throws_ok(
  $$select public.generate_visit_sessions(8::smallint, public.today_jkt(), public.today_jkt() + 13)$$,
  '42501', null, 'an RW admin who has not passed the TOTP step generates no sessions'
);
select throws_ok(
  $$select public.rpc_log_ui_event('scanner_opened', null)$$,
  '42501', 'only staff with a verified authenticator log UI events', 'and logs no UI events'
);
reset role;
select set_config('request.jwt.claims', '', true);
revoke execute on function public.generate_visit_sessions(smallint, date, date), public.rpc_log_ui_event(text, uuid)
  from authenticated;

insert into public.booklets (id, slug, title, pdf_path, status) values
  ('00000000-0000-4000-8000-000000001b51', 'e-booklet-ecowastreme', 'E-Booklet', 'kelurahan/booklets/00000000-0000-4000-8000-000000001b51/booklet.pdf', 'published'),
  ('00000000-0000-4000-8000-000000001b52', 'draf-booklet', 'Draf', 'kelurahan/booklets/00000000-0000-4000-8000-000000001b52/booklet.pdf', 'draft');
select internal.increment_booklet_download('00000000-0000-4000-8000-000000001b51');
select internal.increment_booklet_download('00000000-0000-4000-8000-000000001b52');
select is(
  (select string_agg(slug || '=' || download_count, ' ' order by slug) from public.booklets
   where id in ('00000000-0000-4000-8000-000000001b51', '00000000-0000-4000-8000-000000001b52')),
  'draf-booklet=0 e-booklet-ecowastreme=1',
  'a download counts for a published booklet only'
);
select is(
  has_function_privilege('anon', 'internal.increment_booklet_download(uuid)', 'execute')
  or has_function_privilege('authenticated', 'internal.increment_booklet_download(uuid)', 'execute'),
  false,
  'neither anon nor authenticated can call the counter'
);

-- ===== Staff management =====

grant execute on function public.set_staff_role(uuid, public.app_role, smallint),
  public.set_staff_status(uuid, boolean, text) to authenticated;
insert into auth.sessions (id, user_id) values ('00000000-0000-4000-8000-000000002a01', '00000000-0000-4000-8000-000000000002');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-000000002a02', '00000000-0000-4000-8000-000000000002', 'HP Admin', 'totp', 'verified', now(), now());

-- The superadmin's token, with the method and age of its last verification as parameters.
create temp table step_up_claims as
select method, seconds_ago, jsonb_build_object('sub', p.id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', p.role,
         'claims_version', p.claims_version,
         'amr', jsonb_build_array(jsonb_build_object('method', method, 'timestamp', extract(epoch from now())::bigint - seconds_ago)))::text as claims
from public.profiles p, (values ('totp', 60), ('totp', 600), ('password', 10)) as step_up(method, seconds_ago)
where p.id = '00000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', (select claims from step_up_claims where method = 'totp' and seconds_ago = 60), true);
set local role authenticated;
select lives_ok(
  $$select public.set_staff_role('00000000-0000-4000-8000-000000000002', 'admin_rw', 5::smallint)$$,
  'the superadmin, a minute after a TOTP check, moves an admin to another RW'
);
select throws_ok(
  $$select public.set_staff_role('00000000-0000-4000-8000-000000000002', 'admin_rw', null)$$,
  '22023', null, 'an RW admin needs an RW'
);
select throws_ok(
  $$select public.set_staff_role('00000000-0000-4000-8000-000000000001', 'admin_rw', 5::smallint)$$,
  '42501', null, 'the superadmin never changes their own row'
);
select throws_ok(
  $$select public.set_staff_status('00000000-0000-4000-8000-000000000002', false, 'x')$$,
  '22023', null, 'a status change needs a reason'
);
select lives_ok(
  $$select public.set_staff_status('00000000-0000-4000-8000-000000000002', false, 'Pindah tugas ke kecamatan')$$,
  'the superadmin deactivates an admin'
);
reset role;
select is(
  (select role || ' ' || coalesce(rw_id::text, '-') || ' ' || is_active || ' v' || claims_version from public.profiles
   where id = '00000000-0000-4000-8000-000000000002'),
  'none - false v6',
  'the profile moved, then lost its role and RW when it was deactivated; claims_version went up at each step'
);
select is(
  (select count(*)::int from auth.sessions where user_id = '00000000-0000-4000-8000-000000000002')
  + (select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-000000000002'),
  0,
  'its sessions are ended and its factors removed'
);
select is(
  (select jsonb_object_agg(event_type, details) from public.security_events
   where entity_id = '00000000-0000-4000-8000-000000000002' and event_type in ('role_changed', 'staff_disabled')),
  '{"role_changed": {"from_role": "admin_rw", "to_role": "admin_rw", "from_rw_id": 8, "to_rw_id": 5},
    "staff_disabled": {"from_role": "admin_rw", "from_rw_id": 5}}'::jsonb,
  'both changes raise security events'
);
select is(
  (select actor_role || ': ' || (metadata ->> 'reason') from public.audit_logs
   where action = 'staff.deactivated' and entity_id = '00000000-0000-4000-8000-000000000002'),
  'superadmin: Pindah tugas ke kecamatan',
  'and the deactivation is audited with its reason'
);

select set_config('request.jwt.claims', (select claims from step_up_claims where method = 'totp' and seconds_ago = 600), true);
set local role authenticated;
select throws_ok(
  $$select public.set_staff_status('00000000-0000-4000-8000-000000000002', true, 'Kembali bertugas')$$,
  '42501', 'confirm with a fresh authenticator code first', 'a TOTP check from ten minutes ago is not fresh enough'
);
reset role;
select set_config('request.jwt.claims', (select claims from step_up_claims where method = 'password'), true);
set local role authenticated;
select throws_ok(
  $$select public.set_staff_status('00000000-0000-4000-8000-000000000002', true, 'Kembali bertugas')$$,
  '42501', 'confirm with a fresh authenticator code first', 'nor is a fresh password'
);
reset role;
select set_config('request.jwt.claims', (select claims from step_up_claims where method = 'totp' and seconds_ago = 60), true);
set local role authenticated;
select lives_ok(
  $$select public.set_staff_status('00000000-0000-4000-8000-000000000002', true, 'Kembali bertugas')$$,
  'a fresh check reactivates the admin'
);
reset role;
select is(
  (select role || ' ' || is_active from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  'none true',
  'reactivation only reopens the account; the role does not come back with it (review L9)'
);
-- Deactivation removed the admin's factors; they enrol again before a role comes back (20261029080000).
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-000000002a06', '00000000-0000-4000-8000-000000000002', 'HP Admin Baru', 'totp',
        'verified', now(), now());
set local role authenticated;
select is(
  public.set_staff_role('00000000-0000-4000-8000-000000000002', 'admin_rw', 5::smallint) ->> 'stage',
  'applied',
  'it comes back through set_staff_role'
);
reset role;
select set_config('request.jwt.claims', '', true);
revoke execute on function public.set_staff_role(uuid, public.app_role, smallint),
  public.set_staff_status(uuid, boolean, text) from authenticated;

-- AUTH-12: two verified factors on one account carry no role.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000002a03', '00000000-0000-4000-8000-000000000004', 'HP Utama', 'totp', 'verified', now(), now()),
  ('00000000-0000-4000-8000-000000002a04', '00000000-0000-4000-8000-000000000004', 'HP Lain', 'totp', 'verified', now(), now());
select is(
  internal.staff_token_claims('00000000-0000-4000-8000-000000000004') ->> 'app_role',
  'none',
  'an account with a second verified factor gets no role until its MFA is reset'
);

-- Which is what the superadmin does next, with the 24-hour delay.
grant execute on function public.reset_staff_mfa(uuid) to authenticated;
select set_config('request.jwt.claims', (select claims from step_up_claims where method = 'totp' and seconds_ago = 60), true);
set local role authenticated;
select throws_ok(
  $$select public.reset_staff_mfa('00000000-0000-4000-8000-000000000001')$$,
  '42501', 'a superadmin never resets their own MFA', 'a superadmin never resets their own MFA'
);
select is(
  public.reset_staff_mfa('00000000-0000-4000-8000-000000000004') ->> 'stage',
  'requested',
  'the first call only records the request'
);
select throws_ok(
  $$select public.reset_staff_mfa('00000000-0000-4000-8000-000000000004')$$,
  'P0001', null, 'which cannot be completed within 24 hours'
);
reset role;
select is(
  (select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-000000000004'),
  2,
  'so the factors stay while the request waits'
);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set mfa_reset_requested_at = now() - interval '25 hours'
where id = '00000000-0000-4000-8000-000000000004';
select set_config('app.privileged_rpc', '', true);
set local role authenticated;
select is(
  public.reset_staff_mfa('00000000-0000-4000-8000-000000000004') ->> 'stage',
  'completed',
  'a day later the reset goes through'
);
reset role;
select set_config('request.jwt.claims', '', true);
revoke execute on function public.reset_staff_mfa(uuid) from authenticated;
select is(
  (select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-000000000004'),
  0,
  'every factor of the account is gone'
);
select is(
  internal.staff_token_claims('00000000-0000-4000-8000-000000000004') ->> 'app_role',
  'none',
  'and the account carries no role until the superadmin''s re-enrolment code is used (20261029080200)'
);
select is(
  (select string_agg(severity || ':' || (details ->> 'stage'), ' ' order by id) from public.security_events
   where event_type = 'mfa_reset'),
  'critical:requested critical:completed',
  'both steps are critical security events'
);
select is(
  (select severity || ' ' || occurrences || ' ' || (notified_at is null) from public.security_alerts
   where fingerprint = 'mfa_reset:00000000-0000-4000-8000-000000000004'),
  'critical 2 true',
  'with one open critical alert, queued for out-of-band delivery again at each step'
);
select is(
  (select string_agg(action, ' ' order by id) from public.audit_logs
   where action like 'staff.mfa_reset_%' and entity_id = '00000000-0000-4000-8000-000000000004'),
  'staff.mfa_reset_requested staff.mfa_reset_completed',
  'and both steps are audited'
);

-- A request is only good for a week, and it can be called off.
grant execute on function public.reset_staff_mfa(uuid), public.cancel_staff_mfa_reset(uuid),
  public.cancel_superadmin_promotion(uuid), public.set_staff_role(uuid, public.app_role, smallint),
  public.set_staff_status(uuid, boolean, text) to authenticated;
select set_config('request.jwt.claims', (select claims from step_up_claims where method = 'totp' and seconds_ago = 60), true);
set local role authenticated;
select is(
  public.reset_staff_mfa('00000000-0000-4000-8000-000000000002') ->> 'stage',
  'requested',
  'a reset of the RW admin''s authenticator is requested'
);
reset role;
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set mfa_reset_requested_at = now() - interval '8 days'
where id = '00000000-0000-4000-8000-000000000002';
select set_config('app.privileged_rpc', '', true);
set local role authenticated;
select is(
  public.reset_staff_mfa('00000000-0000-4000-8000-000000000002') ->> 'stage',
  'requested',
  'a request older than a week has lapsed, so the next call starts a new one instead of resetting'
);
select lives_ok(
  $$select public.cancel_staff_mfa_reset('00000000-0000-4000-8000-000000000002')$$,
  'the superadmin calls a pending reset off'
);
select throws_ok(
  $$select public.cancel_staff_mfa_reset('00000000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'after which there is nothing left to cancel'
);
select is(
  public.reset_staff_mfa('00000000-0000-4000-8000-000000000002') ->> 'stage',
  'requested',
  'a fresh request'
);
reset role;

-- The RW admin, a minute after a TOTP check with the authenticator the reset would remove.
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role, 'app_rw_id', rw_id,
           'claims_version', claims_version,
           'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 60)))::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select throws_ok(
  $$select public.cancel_staff_mfa_reset('00000000-0000-4000-8000-000000000004')$$,
  '42501', 'only the superadmin or the staff member themselves cancels an MFA reset',
  'an RW admin cannot call off a reset of someone else'
);
select lives_ok(
  $$select public.cancel_staff_mfa_reset('00000000-0000-4000-8000-000000000002')$$,
  'but the staff member can call off a reset of their own authenticator, proving they still hold it'
);
reset role;
select is(
  (select string_agg(details ->> 'stage', ' ' order by id) from public.security_events
   where event_type = 'mfa_reset' and entity_id = '00000000-0000-4000-8000-000000000002'),
  'requested requested cancelled requested cancelled',
  'every step, the cancellations included, is a critical event'
);

-- A role goes only to an account with its own verified authenticator (20261029080000), as the promoted one has.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-000000002a05', '00000000-0000-4000-8000-000000000003', 'HP Calon', 'totp', 'verified',
        now(), now());
-- Making someone superadmin waits the same way (review L9).
select set_config('request.jwt.claims', (select claims from step_up_claims where method = 'totp' and seconds_ago = 60), true);
set local role authenticated;
select is(
  public.set_staff_role('00000000-0000-4000-8000-000000000003', 'superadmin') ->> 'stage',
  'requested',
  'a promotion to superadmin is only requested at first'
);
select throws_ok(
  $$select public.set_staff_role('00000000-0000-4000-8000-000000000003', 'superadmin')$$,
  'P0001', null, 'and cannot be applied within 24 hours'
);
reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-4000-8000-000000000003'),
  'admin_rw',
  'so the role has not changed yet'
);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set promotion_requested_at = now() - interval '25 hours'
where id = '00000000-0000-4000-8000-000000000003';
select set_config('app.privileged_rpc', '', true);
set local role authenticated;
select is(
  public.set_staff_role('00000000-0000-4000-8000-000000000003', 'superadmin') ->> 'stage',
  'applied',
  'a day later the promotion is applied'
);
reset role;
select is(
  (select role::text || ' ' || (promotion_requested_at is null) from public.profiles
   where id = '00000000-0000-4000-8000-000000000003'),
  'superadmin true',
  'the account is superadmin and its request is closed'
);
select is(
  (select string_agg(details ->> 'stage', ' ' order by id) from public.security_events
   where event_type = 'role_changed' and severity = 'critical' and entity_id = '00000000-0000-4000-8000-000000000003'),
  'requested completed',
  'both steps of a promotion raise critical events'
);
select is(
  (select severity::text || ' ' || occurrences from public.security_alerts
   where fingerprint = 'superadmin_promotion:00000000-0000-4000-8000-000000000003'),
  'critical 2',
  'and one open critical alert, queued again at each step'
);
set local role authenticated;
select is(
  public.set_staff_role('00000000-0000-4000-8000-000000000002', 'superadmin') ->> 'stage',
  'requested',
  'another promotion is requested'
);
select lives_ok(
  $$select public.cancel_superadmin_promotion('00000000-0000-4000-8000-000000000002')$$,
  'and called off'
);
select throws_ok(
  $$select public.cancel_superadmin_promotion('00000000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'once'
);
select is(
  public.set_staff_role('00000000-0000-4000-8000-000000000002', 'admin_rw', 5::smallint) ->> 'stage',
  'applied',
  'any other role change still applies at once'
);

-- A superadmin who was deactivated comes back without the role (review L9).
select lives_ok(
  $$select public.set_staff_status('00000000-0000-4000-8000-000000000003', false, 'Cuti panjang')$$,
  'the second superadmin is deactivated'
);
select lives_ok(
  $$select public.set_staff_status('00000000-0000-4000-8000-000000000003', true, 'Kembali dari cuti')$$,
  'and reactivated'
);
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-000000002a07', '00000000-0000-4000-8000-000000000003', 'HP Calon Baru', 'totp',
        'verified', now(), now());
set local role authenticated;
select is(
  public.set_staff_role('00000000-0000-4000-8000-000000000003', 'superadmin') ->> 'stage',
  'requested',
  'so being superadmin again is a new promotion, which waits 24 hours'
);
reset role;
select is(
  (select role || ' ' || is_active from public.profiles where id = '00000000-0000-4000-8000-000000000003'),
  'none true',
  'and meanwhile the reactivated account holds no role'
);
select set_config('request.jwt.claims', '', true);
revoke execute on function public.reset_staff_mfa(uuid), public.cancel_staff_mfa_reset(uuid),
  public.cancel_superadmin_promotion(uuid), public.set_staff_role(uuid, public.app_role, smallint),
  public.set_staff_status(uuid, boolean, text) from authenticated;

-- ===== Service-role entry points =====
-- Which svc_ functions exist and who may execute them is enumerated in rls_enumeration.sql.

set local role anon;
select throws_ok($$select public.svc_rate_limit_hit('test:svc', 5, 60)$$, '42501', null, 'anon cannot call a svc_ function');
reset role;
set local role authenticated;
select throws_ok($$select public.svc_expire_stale_bookings()$$, '42501', null, 'nor can a signed-in user');
reset role;

set local role service_role;
select is(public.svc_rate_limit_hit('test:svc', 5, 60), true, 'the service role reaches internal through the wrapper');
select lives_ok(
  $$select public.svc_log_audit('export.downloaded', 'exports', '00000000-0000-4000-8000-000000000001', 'x1', '{"rows": 3}')$$,
  'the server logs a staff member''s application event'
);
select lives_ok(
  $$select public.svc_log_audit('booking.access_link_resent', 'bookings', null, 'x2', '{}')$$,
  'or a visitor''s'
);
select throws_ok(
  $$select public.svc_log_audit('export.downloaded', 'exports', '00000000-0000-4000-8000-000000000003', 'x3', '{}')$$,
  '42501', null, 'but never in the name of a deactivated staff member'
);
reset role;
select is(
  coalesce(current_setting('app.actor_id', true), '') || '/' || coalesce(current_setting('app.actor_role', true), ''),
  '/',
  'the actor the server named does not outlive its event'
);
select set_config('app.actor_id', '', true), set_config('app.actor_role', '', true);
select is(
  (select string_agg(action || ' ' || actor_role || ' ' || coalesce(actor_id::text, '-'), ', ' order by id)
   from public.audit_logs where entity_id in ('x1', 'x2')),
  'export.downloaded superadmin 00000000-0000-4000-8000-000000000001, booking.access_link_resent visitor -',
  'each event carries the actor the server named'
);

-- ===== Midtrans payload minimisation =====

-- A settlement notification carrying everything Midtrans may echo back about the booker.
create temp table midtrans_reply as select '{
  "transaction_time": "2026-10-16 10:00:00", "transaction_status": "settlement", "transaction_id": "tx-1",
  "status_code": "200", "payment_type": "bank_transfer", "order_id": "GSK-7F3K9Q2N-01", "merchant_id": "G000000001",
  "gross_amount": "500000.00", "currency": "IDR", "fraud_status": "accept",
  "va_numbers": [{"bank": "bca", "va_number": "12345678901"}],
  "customer_details": {"first_name": "Budi", "last_name": "Santoso", "email": "budi@example.test", "phone": "+6281234567891",
    "billing_address": {"first_name": "Budi", "address": "Jl. Mawar 1", "phone": "081234567891"}},
  "custom_field1": "budi@example.test",
  "item_details": [{"id": "pkg", "name": "Paket Eduwisata", "price": 500000, "quantity": 1,
                    "shipping_address": {"phone": "081234567891"}}]
}'::jsonb as reply;

insert into public.payment_events (order_id, source, event_hash, payload)
select 'GSK-7F3K9Q2N-01', 'webhook', 'event-hash-minimised', reply from midtrans_reply;
insert into public.payments (id, booking_id, attempt_no, provider, order_id, gross_amount, last_payload)
select '00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000e5', 1, 'midtrans', 'GSK-7F3K9Q2N-01',
       500000, reply from midtrans_reply;
select is(
  (select payload::text ~* '(Budi|Santoso|Mawar|@|\+62|0812)' from public.payment_events where event_hash = 'event-hash-minimised')
  or (select last_payload::text ~* '(Budi|Santoso|Mawar|@|\+62|0812)' from public.payments
      where id = '00000000-0000-4000-8000-0000000000f6'),
  false,
  'no name, email, phone or address from a Midtrans reply is stored, in payment_events or payments'
);
select is(
  (select jsonb_build_object('status', payload ->> 'transaction_status', 'amount', payload ->> 'gross_amount',
                             'va', payload -> 'va_numbers' -> 0 ->> 'va_number', 'item', payload -> 'item_details' -> 0 ->> 'name')
   from public.payment_events where event_hash = 'event-hash-minimised'),
  '{"status": "settlement", "amount": "500000.00", "va": "12345678901", "item": "Paket Eduwisata"}'::jsonb,
  'while what reconciliation needs stays'
);
update public.payments set last_payload = (select reply from midtrans_reply) || '{"transaction_status": "pending"}'
where id = '00000000-0000-4000-8000-0000000000f6';
select is(
  (select (last_payload ? 'customer_details') or (last_payload ->> 'transaction_status') <> 'pending' from public.payments
   where id = '00000000-0000-4000-8000-0000000000f6'),
  false,
  'a later reply stored on the payment is minimised too'
);
select is(
  internal.minimise_midtrans_payload('{"order_id": "GSK-7F3K9Q2N-01", "signature_key": "abc", "customer_note": "Bu Ani",
    "va_numbers": [{"bank": "bca", "va_number": "12345678901", "holder": "Budi Santoso"}],
    "transaction_details": {"order_id": "GSK-7F3K9Q2N-01", "gross_amount": "500000.00", "customer_name": "Budi"}}'),
  '{"order_id": "GSK-7F3K9Q2N-01", "va_numbers": [{"bank": "bca", "va_number": "12345678901"}],
    "transaction_details": {"order_id": "GSK-7F3K9Q2N-01", "gross_amount": "500000.00"}}'::jsonb,
  'only the keys reconciliation reads survive; unknown ones are dropped at every level, the signature too'
);
select is(internal.minimise_midtrans_payload(null), null, 'and an absent reply stays absent');

-- ===== Append-only logs =====

insert into public.booking_events (booking_id, to_status, actor_type)
values ('00000000-0000-4000-8000-0000000000e5', 'quoted', 'visitor');
select throws_ok(
  $$update public.booking_events set reason = 'diubah' where booking_id = '00000000-0000-4000-8000-0000000000e5'$$,
  '42501', null, 'a booking event is never edited'
);
select throws_ok(
  $$delete from public.booking_events where booking_id = '00000000-0000-4000-8000-0000000000e5'$$,
  '42501', 'booking_events is append-only: rows are never deleted', 'or deleted'
);
select throws_ok('truncate public.audit_logs', '42501', 'audit_logs is append-only: rows are never deleted', 'and no log can be truncated');

insert into public.payment_events (order_id, source, event_hash, payload)
values ('GSK-7F3K9Q2M-01', 'webhook', 'event-hash-1', '{"transaction_status": "settlement", "customer_details": {"first_name": "Siti"}}');
select lives_ok(
  $$update public.payment_events set processed_at = now(), processing_result = 'applied' where event_hash = 'event-hash-1'$$,
  'processing marks a payment event done'
);
select throws_ok(
  $$update public.payment_events set payload = '{}' where event_hash = 'event-hash-1'$$,
  '42501', 'payment_events is append-only: only processed_at, processing_result may change', 'but what Midtrans sent never changes'
);

insert into public.webhook_rejections (provider, reason) values ('midtrans', 'signature_invalid');
select throws_ok(
  $$delete from public.webhook_rejections where reason = 'signature_invalid'$$,
  '42501', null, 'a rejection record stays'
);
select set_config('app.purge', 'on', true);
select lives_ok(
  $$delete from public.webhook_rejections where reason = 'signature_invalid'$$,
  'until the retention run prunes it'
);
select lives_ok(
  $$delete from public.payment_events where event_hash = 'event-hash-1'$$,
  'and delete an old payment event'
);
select set_config('app.purge', '', true);

insert into public.payment_adjustments (id, booking_id, type, amount, reason, evidence_path, proposed_by)
values ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-0000000000e1', 'write_off', 1000,
        'selisih pembulatan transfer bank', 'documents/bookings/e1/payment-proof-1.jpg', '00000000-0000-4000-8000-000000000002');
select throws_ok(
  $$update public.payment_adjustments set amount = 900000 where id = '00000000-0000-4000-8000-000000000c01'$$,
  '42501', 'the proposal of an adjustment never changes; only its approval workflow moves',
  'the approver approves exactly what was proposed'
);
select lives_ok(
  $$update public.payment_adjustments set status = 'approved', approved_by = '00000000-0000-4000-8000-000000000001',
      approved_at = now() where id = '00000000-0000-4000-8000-000000000c01'$$,
  'the approval moves it'
);
update public.payment_adjustments set status = 'applied', applied_at = now() where id = '00000000-0000-4000-8000-000000000c01';
select throws_ok(
  $$update public.payment_adjustments set rejected_reason = 'dibatalkan' where id = '00000000-0000-4000-8000-000000000c01'$$,
  '42501', 'an applied adjustment is final', 'an applied adjustment is final'
);
select throws_ok(
  $$delete from public.payment_adjustments where id = '00000000-0000-4000-8000-000000000c01'$$,
  '42501', 'payment_adjustments are never deleted', 'and never deleted'
);

select is(
  (select bool_or(has_table_privilege(api_role, 'public.' || log_table, privilege))
   from unnest(array['anon', 'authenticated', 'service_role']) as api_role,
        unnest(array['booking_events', 'payment_events', 'webhook_rejections', 'package_price_history', 'ticket_scans',
                     'revenue_share_entries', 'security_events', 'audit_logs', 'login_attempts', 'payment_adjustments']) as log_table,
        unnest(array['UPDATE', 'DELETE', 'TRUNCATE']) as privilege),
  false,
  'no API role, not even the service role, may update, delete or truncate a log'
);

-- ===== Ledger hash chain =====

insert into public.payout_batches (id, beneficiary_key, period_from, period_to, total_amount, created_by)
values ('00000000-0000-4000-8000-000000000b01', 'kelurahan', pg_temp.days_from_today(16), pg_temp.days_from_today(45), 300000,
        '00000000-0000-4000-8000-000000000001');
-- The rule-in-use test above already wrote one ledger row for e1; these three follow it.
insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
  rw_id, base_amount, pct, amount, entry_hash)
values
  ('00000000-0000-4000-8000-0000000000e5', 'settlement', 'package', '{"lines": 2}', 'kelurahan', 'kelurahan',
   null, 450000, 30, 135000, 'picked-by-the-caller'),
  ('00000000-0000-4000-8000-0000000000e5', 'settlement', 'package', '{"lines": 2}', 'rw_treasury', 'rw:5',
   5, 450000, 70, 315000, null),
  ('00000000-0000-4000-8000-0000000000e5', 'settlement', 'addon:00000000-0000-4000-8000-000000000801', '{"lines": 1}',
   'rw_treasury', 'rw:5', 5, 30000, 100, 30000, null);
select is(
  (select count(*) filter (where entry_hash ~ '^[0-9a-f]{64}$') = count(*) and count(*) = 4
   from public.revenue_share_entries),
  true,
  'the chain computes every hash itself, whatever the caller sent'
);
select is(
  (select count(*)::int from public.revenue_share_entries entry
   join public.revenue_share_entries previous
     on previous.id = (select max(id) from public.revenue_share_entries where id < entry.id)
   where entry.prev_hash = previous.entry_hash),
  3,
  'each ledger row carries the hash of the row before it'
);
select is(
  internal.verify_ledger_chain(),
  '{"ok": true, "checked": 4, "first_broken_id": null}'::jsonb,
  'an untouched ledger verifies'
);
select throws_ok(
  $$update public.revenue_share_entries set amount = 1
    where booking_id = '00000000-0000-4000-8000-0000000000e5' and line_ref = 'package' and beneficiary_key = 'rw:5'$$,
  '42501', null, 'a ledger amount never changes; a correction is a new row'
);
select lives_ok(
  $$update public.revenue_share_entries set payout_batch_id = '00000000-0000-4000-8000-000000000b01'
    where beneficiary_key = 'kelurahan'$$,
  'a payout run claims a ledger row'
);
select throws_ok(
  $$update public.revenue_share_entries set payout_batch_id = null where beneficiary_key = 'kelurahan'$$,
  '42501', 'revenue_share_entries.payout_batch_id is set once and never changed', 'and never releases or moves it'
);
select is((internal.verify_ledger_chain() ->> 'ok')::boolean, true, 'claiming a row for a payout keeps the chain intact');

-- Someone with database access edits an amount behind the triggers' back.
alter table public.revenue_share_entries disable trigger append_only;
update public.revenue_share_entries set amount = 300000
where booking_id = '00000000-0000-4000-8000-0000000000e5' and line_ref = 'package' and beneficiary_key = 'rw:5';
alter table public.revenue_share_entries enable trigger append_only;
select is(
  internal.verify_ledger_chain(),
  (select jsonb_build_object('ok', false, 'checked', (select count(*) from public.revenue_share_entries where id < edited.id),
                             'first_broken_id', edited.id)
   from public.revenue_share_entries edited
   where booking_id = '00000000-0000-4000-8000-0000000000e5' and line_ref = 'package' and beneficiary_key = 'rw:5'),
  'verification stops at the edited row'
);

-- ===== Views =====

select hasnt_column('public', 'v_session_availability', 'pending_share', 'anon''s availability carries no unpaid share');
select hasnt_column('public', 'v_public_reviews', 'booking_id', 'a public review does not point at its booking');
select hasnt_column('public', 'v_bookings_staff', 'pic_phone', 'the staff list has no raw phone');
select hasnt_column('public', 'v_bookings_staff', 'pic_email', 'no raw email');
select hasnt_column('public', 'v_bookings_staff', 'pic_name', 'and no full name');

select is(
  (select remaining from public.v_session_availability where id = '00000000-0000-4000-8000-000000001b03'),
  20,
  'an open future session shows the seats left'
);
select is(
  (select count(*)::int from public.v_session_availability
   where id in ('00000000-0000-4000-8000-000000001b01', '00000000-0000-4000-8000-0000000000b9')),
  0,
  'past and closed sessions are not offered'
);

insert into public.reviews (id, booking_id, rw_ids, rating, body, reviewer_name, institution_name, is_anonymous, status) values
  ('00000000-0000-4000-8000-000000003a01', '00000000-0000-4000-8000-000000001e04', '{5}', 5,
   'Anak-anak senang belajar memilah sampah.', 'Siti Rahmawati', 'SD Negeri Gisikdrono 01', false, 'published'),
  ('00000000-0000-4000-8000-000000003a02', '00000000-0000-4000-8000-000000001e05', '{5}', 4,
   'Kegiatan maggot sangat menarik.', 'Budi Santoso', 'SMP Negeri 2', true, 'published'),
  ('00000000-0000-4000-8000-000000003a03', '00000000-0000-4000-8000-000000001e06', '{5}', 3,
   'Masih menunggu moderasi ya.', 'Dewi Lestari', 'TK Pelita', false, 'pending');
select is(
  (select string_agg(reviewer_name || ' (' || institution_name || ')', ', ' order by rating desc) from public.v_public_reviews
   where id in ('00000000-0000-4000-8000-000000003a01', '00000000-0000-4000-8000-000000003a02',
                '00000000-0000-4000-8000-000000003a03')),
  'Siti (SD Negeri Gisikdrono 01), Pengunjung (SMP Negeri 2)',
  'published reviews show the first name, or Pengunjung when anonymous; pending ones not at all'
);

-- A combo visiting both RWs in five days, and a paid group at the gate today with a manual check-in.
select set_config('app.in_rpc', '1', true);
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-000000001b06', 5, public.today_jkt(), '05:50', '06:00', 'Hari ini', 40);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at, paid_at, amount_paid) values
  ('00000000-0000-4000-8000-000000001e11', 'GSK-J0B01E11', 'quoted', '00000000-0000-4000-8000-0000000000c1', '{}', '{5,8}',
   'school', 'Guru Kombo', '+628123450011', 'kombo@example.test', 4, public.today_jkt() + 5, public.today_jkt() + 5,
   200000, 200000, 'v1', now(), null, 0),
  ('00000000-0000-4000-8000-000000001e12', 'GSK-J0B01E12', 'paid', '00000000-0000-4000-8000-0000000000c1', '{}', '{5}',
   'school', 'Guru Hari Ini', '+628123450012', 'hariini@example.test', 4, public.today_jkt(), public.today_jkt(),
   100000, 100000, 'v1', now(), now() - interval '1 day', 100000);
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at) values
  ('00000000-0000-4000-8000-000000001e11', 5, '00000000-0000-4000-8000-000000001b04', 1, 4, 'unreserved', null),
  ('00000000-0000-4000-8000-000000001e11', 8, '00000000-0000-4000-8000-000000001b05', 2, 4, 'unreserved', null),
  ('00000000-0000-4000-8000-000000001e12', 5, '00000000-0000-4000-8000-000000001b06', 1, 4, 'reserved', now());
insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount, status, method, settlement_time)
values ('00000000-0000-4000-8000-000000001e12', 1, 'midtrans', 'GSK-J0B01E12-01', 100000, 'settled', 'qris', now());
insert into public.tickets_qr (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
  valid_from, valid_until, pax_count, key_id, status, checked_in_pax, checked_in_at)
select '00000000-0000-4000-8000-000000001d12', l.booking_id, l.id, 5, l.visit_session_id, 'GSK-J0B01E12-05',
  public.today_jkt(), now() - interval '1 hour', now() + interval '3 hours', 4, 'k1', 'used', 4, now()
from public.booking_legs l where l.booking_id = '00000000-0000-4000-8000-000000001e12';
select set_config('app.in_rpc', '', true);
insert into public.ticket_scans (attempt_id, ticket_id, rw_id, scanned_by, phase, result, source)
values (gen_random_uuid(), '00000000-0000-4000-8000-000000001d12', 5, '00000000-0000-4000-8000-000000000002',
        'check_in', 'ok', 'manual');

-- 0005 brings the real grants and policies; until then the readers get open ones, so these tests
-- exercise what the views themselves decide.
do $$
declare
  base_table text;
begin
  foreach base_table in array array['tour_packages', 'booking_legs', 'visit_sessions', 'payments', 'tickets_qr',
    'invoices', 'ticket_scans', 'revenue_share_entries', 'rw_units', 'umkm_vendors'] loop
    execute format('grant select on public.%I to authenticated', base_table);
    execute format('create policy test_view_read on public.%I for select to authenticated using (true)', base_table);
  end loop;
end;
$$;
grant select on public.v_bookings_staff, public.v_booking_admin, public.v_attendance_today, public.v_booking_export,
  public.v_revenue_recap_daily, public.v_revenue_recap_by_party, public.v_revenue_recap_by_booking,
  public.v_finance_daily to authenticated;

select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role,
                            'app_rw_id', rw_id, 'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select is(
  (select string_agg(booking_code || ' ' || coalesce(total_amount::text, '-') || ' ' || shows_amounts, ', ' order by booking_code)
   from public.v_bookings_staff where booking_code in ('GSK-J0B01E06', 'GSK-J0B01E11', 'GSK-R0B01E07')),
  'GSK-J0B01E06 100000 true, GSK-J0B01E11 200000 true, GSK-R0B01E07 100000 true',
  'the superadmin sees every booking with its money'
);
select is(
  (select phone_masked || ' ' || email_masked || ' ' || pic_first_name from public.v_bookings_staff
   where booking_code = 'GSK-J0B01E06'),
  '+62812••••06 g***@example.test Guru',
  'contacts appear masked'
);
select is(
  (select (payments -> 0 ->> 'order_id') || ' ' || (payments -> 0 ->> 'status') || ' ' || (payments -> 0 ? 'gross_amount')
          || ' ' || (tickets -> 0 ->> 'status')
   from public.v_booking_admin where booking_code = 'GSK-J0B01E05'),
  'GSK-J0B01E05-01 settled false expired',
  'the detail view adds payments, without their amounts since the review of 0005, and tickets'
);
select is(
  (select jsonb_object_agg(beneficiary_key, jsonb_build_array(beneficiary_name, accrued, paid_out, outstanding))
   from public.v_revenue_recap_by_party),
  '{"kelurahan": [null, 135000, 135000, 0], "rw:5": ["RW 05 Ecowastreme", 1130000, 0, 1130000]}'::jsonb,
  'the party recap sums the ledger, paid out and outstanding'
);
select is(
  (select jsonb_array_length(entries) from public.v_revenue_recap_by_booking where booking_code = 'GSK-7F3K9Q2N'),
  3,
  'the booking recap lists a booking''s ledger entries'
);
select is(
  (select qris_count >= 1 from public.v_finance_daily where day = public.today_jkt()),
  true,
  'the finance view counts today''s QRIS settlement'
);
reset role;

-- The RW 05 admin (profile 0002 since the staff tests).
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role,
                            'app_rw_id', rw_id, 'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select is(
  (select string_agg(booking_code || ' ' || coalesce(total_amount::text, '-') || ' ' || shows_amounts, ', ' order by booking_code)
   from public.v_bookings_staff
   where booking_code in ('GSK-J0B01E02', 'GSK-J0B01E06', 'GSK-J0B01E11', 'GSK-R0B01E07')),
  'GSK-J0B01E06 100000 true, GSK-J0B01E11 - false',
  'an RW admin sees their own bookings in the window, with money only where the booking is theirs alone'
);
select is(
  (select string_agg(rw_id::text, ' ') from public.v_booking_export where booking_code = 'GSK-J0B01E11'),
  '5',
  'a combo exports only the admin''s own leg'
);
select is(
  (select booked_pax || ' ' || checked_in_pax || ' ' || is_manual from public.v_attendance_today
   where booking_code = 'GSK-J0B01E12'),
  '4 4 true',
  'today''s gate list shows the group, its check-in and the manual flag'
);
select is(
  (select string_agg(beneficiary_key, ' ') from public.v_revenue_recap_by_party),
  'rw:5',
  'the RW admin sees their RW''s ledger keys, never the kelurahan''s'
);
select is(
  (select count(*)::int from public.v_revenue_recap_by_booking) + (select count(*)::int from public.v_finance_daily),
  0,
  'and none of the superadmin-only recaps'
);
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  base_table text;
begin
  foreach base_table in array array['tour_packages', 'booking_legs', 'visit_sessions', 'payments', 'tickets_qr',
    'invoices', 'ticket_scans', 'revenue_share_entries', 'rw_units', 'umkm_vendors'] loop
    execute format('drop policy test_view_read on public.%I', base_table);
    execute format('revoke select on public.%I from authenticated', base_table);
  end loop;
end;
$$;

-- ===== PII paths for staff =====

grant execute on function public.rpc_reveal_booking_contact(uuid, text), public.rpc_get_participants(uuid) to authenticated;
insert into public.booking_participants (booking_id, seq_no, full_name, group_label, role_label) values
  ('00000000-0000-4000-8000-000000001e06', 1, 'Nanda Putri', 'Kelas 4B', 'student'),
  ('00000000-0000-4000-8000-000000001e06', 2, 'Pak Hadi', null, 'teacher');

-- The RW 05 admin, at AAL2.
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2', 'app_role', role,
                            'app_rw_id', rw_id, 'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select is(
  public.rpc_reveal_booking_contact('00000000-0000-4000-8000-000000001e06', 'Konfirmasi jumlah peserta') ->> 'pic_phone',
  '+628123450006',
  'an RW admin reveals the contact of their own booking, giving a reason'
);
select throws_ok(
  $$select public.rpc_reveal_booking_contact('00000000-0000-4000-8000-000000001e06', '')$$,
  '22023', null, 'never without a reason'
);
select throws_ok(
  $$select public.rpc_reveal_booking_contact('00000000-0000-4000-8000-000000001e02', 'Konfirmasi kedatangan')$$,
  '42501', 'this booking belongs to another RW', 'nor for another RW''s booking'
);
select throws_ok(
  $$select public.rpc_reveal_booking_contact('00000000-0000-4000-8000-000000001e07', 'Konfirmasi kedatangan')$$,
  '42501', null, 'nor outside the window around the visit'
);
select is(
  (select string_agg(full_name, ', ' order by seq_no) from public.rpc_get_participants('00000000-0000-4000-8000-000000001e06')),
  'Nanda Putri, Pak Hadi',
  'the participant list comes through its own RPC'
);
reset role;
select ok(
  pg_temp.holds_advisory_lock('pii_reveal:00000000-0000-4000-8000-000000000002'),
  'one staff member''s reveals take turns, so parallel calls cannot all count below the cap'
);
select is(
  (select details ->> 'reason' from public.security_events
   where event_type = 'pii_revealed' and entity_id = '00000000-0000-4000-8000-000000001e06' and details ? 'reason'),
  'Konfirmasi jumlah peserta',
  'each reveal is a security event with its reason'
);
select is(
  (select actor_role || ' ' || (metadata ->> 'rows') from public.audit_logs
   where action = 'participants.read' and entity_id = '00000000-0000-4000-8000-000000001e06'),
  'admin_rw 2',
  'and each participant read is audited with its row count'
);

-- Forty-seven more reveals today bring the admin to 49 (the contact reveal and the participant read above
-- count too); the 50th raises an alert, the 51st is refused.
insert into public.security_events (event_type, actor_id, entity_type, entity_id)
select 'pii_revealed', '00000000-0000-4000-8000-000000000002', 'bookings', 'earlier-' || n from generate_series(1, 47) n;
set local role authenticated;
select lives_ok(
  $$select public.rpc_reveal_booking_contact('00000000-0000-4000-8000-000000001e06', 'Konfirmasi ulang jadwal')$$,
  'the 50th reveal of the day still goes through'
);
select throws_ok(
  $$select public.rpc_reveal_booking_contact('00000000-0000-4000-8000-000000001e06', 'Konfirmasi ulang jadwal')$$,
  'P0001', 'the daily limit of 50 personal-data reveals is reached', 'the 51st is refused'
);
reset role;
select is(
  (select severity::text from public.security_alerts
   where fingerprint = 'pii_reveal_cap:00000000-0000-4000-8000-000000000002:' || public.today_jkt()),
  'high',
  'and reaching the cap raised a high alert'
);

-- Without a verified authenticator nothing is revealed.
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal1', 'app_role', role,
                            'claims_version', claims_version)::text
  from public.profiles where id = '00000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select throws_ok(
  $$select public.rpc_get_participants('00000000-0000-4000-8000-000000001e06')$$,
  '42501', null, 'not even to the superadmin at AAL1'
);
reset role;
select set_config('request.jwt.claims', '', true);
revoke execute on function public.rpc_reveal_booking_contact(uuid, text), public.rpc_get_participants(uuid) from authenticated;

-- ===== Audit log =====

select is(
  (select actor_role || ' ' || actor_id from public.audit_logs
   where action = 'bookings.update' and entity_id = '00000000-0000-4000-8000-0000000000e5'
     and metadata -> 'changed_columns' ? 'discount_amount'),
  'superadmin 00000000-0000-4000-8000-000000000001',
  'a staff edit is logged under the staff member who made it'
);
select is(
  (select after from public.audit_logs
   where action = 'bookings.update' and entity_id = '00000000-0000-4000-8000-0000000000e5'
     and metadata -> 'changed_columns' ? 'discount_amount'),
  '{"discount_amount": 50000, "total_amount": 450000}'::jsonb,
  'an update copies only the values that changed'
);
select is(
  (select rw_id from public.audit_logs where action = 'bookings.insert' and entity_id = '00000000-0000-4000-8000-0000000000e5'),
  5::smallint,
  'a booking''s audit rows carry its RW'
);
select is(
  (select actor_role || ' ' || coalesce(actor_id::text, 'no actor') from public.audit_logs
   where action = 'payout_batches.insert' and entity_id = '00000000-0000-4000-8000-000000000b01'),
  'cron no actor',
  'a job without a session is logged as cron'
);

update public.bookings set pic_phone = '+6281299998888', pic_email = 'tata.usaha@sdgisikdrono.test'
where id = '00000000-0000-4000-8000-0000000000e5';
select is(
  (select jsonb_build_object('before', before, 'after', after, 'changed', metadata -> 'changed_columns')
   from public.audit_logs where action = 'bookings.update' and entity_id = '00000000-0000-4000-8000-0000000000e5'
   order by id desc limit 1),
  '{"before": null, "after": null, "changed": ["email_masked", "phone_masked", "pic_email", "pic_phone"]}'::jsonb,
  'a contact change is logged by column name, without a single value'
);

insert into public.booking_participants (booking_id, seq_no, full_name, group_label, role_label)
values ('00000000-0000-4000-8000-0000000000e5', 1, 'Andi Pratama', 'Kelas 5A', 'student');
select is(
  (select bool_or((after ? 'full_name') or after::text ~ '(Andi|Rina|Joko|Tari)') from public.audit_logs
   where action = 'booking_participants.insert'),
  false,
  'participants are logged without their names'
);

insert into public.site_settings (key, value, is_public) values ('contact.whatsapp_number', '"+6281333334444"', true)
on conflict (key) do update set value = excluded.value;
select is(
  (select coalesce(after, '{}') ? 'value' from public.audit_logs
   where entity_type = 'site_settings' and entity_id = 'contact.whatsapp_number' order by id desc limit 1),
  false,
  'a public contact number in the settings is still kept out of the log'
);

select set_config('app.audit_mode', 'names_only', true);
update public.bookings set institution_name = 'SD Negeri Gisikdrono 02' where id = '00000000-0000-4000-8000-0000000000e5';
select set_config('app.audit_mode', '', true);
select is(
  (select jsonb_build_object('before', before, 'after', after, 'metadata', metadata)
   from public.audit_logs where action = 'bookings.update' and entity_id = '00000000-0000-4000-8000-0000000000e5'
   order by id desc limit 1),
  '{"before": null, "after": null, "metadata": {"changed_columns": ["institution_name"], "audit_mode": "names_only"}}'::jsonb,
  'in names_only mode (the retention runs) even allow-listed values stay out'
);

create temp table audit_count_before as select count(*) as n from public.audit_logs;
update public.rw_units set name = name where id = 5;
select is((select count(*) from public.audit_logs), (select n from audit_count_before), 'an update that changes nothing writes nothing');

-- Service-role code must say whom it acts for, unless it acts for the visitor.
set local role service_role;
select throws_ok(
  $$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
    values (5, 1, 'Pagi', '08:00', '10:00', 40)$$,
  '42501', 'audit: a service action must name its actor (set app.actor_id)',
  'a service-role write that does not name its actor is refused'
);
select set_config('app.actor_id', '00000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
    values (5, 1, 'Pagi', '08:00', '10:00', 40)$$,
  'naming the staff member lets it through'
);
select set_config('app.actor_id', '', true);
select set_config('app.actor_role', 'visitor', true);
select lives_ok(
  $$insert into public.booking_participants (booking_id, seq_no, full_name, role_label)
    values ('00000000-0000-4000-8000-0000000000e5', 2, 'Bu Rina', 'teacher')$$,
  'a guest flow may stay anonymous when it says it acts for the visitor'
);
select set_config('app.actor_role', '', true);
reset role;
select is(
  (select actor_role || ' ' || actor_id from public.audit_logs where action = 'session_templates.insert' order by id desc limit 1),
  'service 00000000-0000-4000-8000-000000000002',
  'and the log shows whom the service acted for'
);

select lives_ok(
  $$select internal.log_audit('purge_run', 'booking_participants', null, '{"deleted": 0}')$$,
  'jobs write application events through the helper'
);
select is(
  (select actor_role || ' ' || (metadata ->> 'deleted') from public.audit_logs where action = 'purge_run' and metadata ? 'deleted'),
  'cron 0',
  'and the event lands with its metadata'
);

select is(
  (select (internal.verify_audit_chain() ->> 'checked')::bigint = count(*) from public.audit_logs),
  true,
  'every audit row written in this test is chained and verifies'
);
select set_config('app.purge', 'on', true);
delete from public.audit_logs where id = (select min(id) from public.audit_logs);
select set_config('app.purge', '', true);
select is((internal.verify_audit_chain() ->> 'ok')::boolean, true, 'pruning the oldest rows leaves the rest verifiable');

-- Someone erases who created the session template.
alter table public.audit_logs disable trigger append_only;
update public.audit_logs set actor_role = 'cron', actor_id = null
where id = (select max(id) from public.audit_logs where action = 'session_templates.insert');
alter table public.audit_logs enable trigger append_only;
select is(
  (internal.verify_audit_chain() ->> 'first_broken_id')::bigint,
  (select max(id) from public.audit_logs where action = 'session_templates.insert'),
  'verification stops at the row whose actor was erased'
);

select is(
  (select count(*)::int from public.audit_logs
   where concat(before::text, after::text, metadata::text) similar to '%(\+62|@)%'),
  0,
  'no phone number or email address reached the audit log'
);

-- ===== Pruning operational tables =====
-- Last, because it deletes audit rows the sections above read. The chain is still broken by the
-- tamper test, which is the first case.

insert into public.notifications (channel, template, recipient, params, dedupe_key, created_at) values
  ('email', 'security_alert', 'alerts@example.test', '{"severity": "high"}', 'old:200-days', now() - interval '200 days'),
  ('email', 'security_alert', 'alerts@example.test', '{"severity": "high"}', 'old:40-days', now() - interval '40 days');
insert into public.webhook_rejections (provider, reason, received_at) values ('midtrans', 'signature_invalid', now() - interval '40 days');
insert into public.login_attempts (success, reason, attempted_at) values (false, 'bad_password', now() - interval '2 days');
insert into public.rate_limit_buckets (key, window_start, count) values ('test:old', now() - interval '2 days', 3);
insert into public.security_events (event_type, occurred_at) values ('rate_limited', now() - interval '13 months');
insert into public.ticket_scans (attempt_id, rw_id, scanned_by, phase, result, ip, scanned_at)
values (gen_random_uuid(), 5, '00000000-0000-4000-8000-000000000002', 'validate', 'not_found', '10.0.0.9',
        now() - interval '25 months');
insert into public.payment_events (order_id, source, event_hash, payload, received_at)
values ('GSK-7F3K9Q2M-01', 'webhook', 'event-hash-old', '{"customer_details": {"first_name": "Siti"}}', now() - interval '25 months');
create temp table audit_rows_before_prune as select count(*) as n from public.audit_logs;

select lives_ok($$select internal.prune_operational_tables()$$, 'the monthly prune runs');
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is(
  (select count(*)::int from public.notifications where dedupe_key = 'old:200-days')
  + (select count(*)::int from public.webhook_rejections where received_at < now() - interval '30 days')
  + (select count(*)::int from public.login_attempts where attempted_at < now() - interval '24 hours')
  + (select count(*)::int from public.rate_limit_buckets where key = 'test:old')
  + (select count(*)::int from public.security_events where occurred_at < now() - interval '12 months')
  + (select count(*)::int from public.payment_events where event_hash = 'event-hash-old')
  + (select count(*)::int from public.ticket_scans where scanned_at < now() - interval '24 months'),
  0,
  'rows past their window are gone, scans that kept an officer''s IP for 24 months among them'
);
select is(
  (select params from public.notifications where dedupe_key = 'old:40-days'),
  '{}'::jsonb,
  'a month-old message keeps its row but loses its params'
);
select is(
  (select details ->> 'reason' from public.security_events where event_type = 'cron_failed' and entity_type = 'audit_logs'),
  'audit_chain_broken',
  'a broken audit chain is reported instead of pruned'
);
select is(
  (select count(*) from public.audit_logs),
  (select n + 1 from audit_rows_before_prune),
  'so no audit row is deleted; only the run''s own row is added'
);

-- Put the erased actor back, then age one row past 24 months.
alter table public.audit_logs disable trigger append_only;
update public.audit_logs set actor_role = 'service', actor_id = '00000000-0000-4000-8000-000000000002'
where id = (select max(id) from public.audit_logs where action = 'session_templates.insert');
alter table public.audit_logs enable trigger append_only;
select is((internal.verify_audit_chain() ->> 'ok')::boolean, true, 'restoring the row repairs the chain');
insert into public.audit_logs (occurred_at, actor_role, action, entity_type)
values (now() - interval '25 months', 'cron', 'test.old', 'test');
create temp table old_audit_row as select id, entry_hash from public.audit_logs where action = 'test.old';
select internal.log_audit('test.recent', 'test', null, '{}');

select internal.prune_operational_tables();
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is(
  (select count(*)::int from public.audit_logs where id <= (select id from old_audit_row)),
  0,
  'with an intact chain, audit rows older than 24 months are pruned'
);
select is(
  (select jsonb_build_object('id', (metadata ->> 'audit_anchor_id')::bigint, 'hash', metadata ->> 'audit_anchor_hash')
   from public.audit_logs where action = 'purge_run' order by id desc limit 1),
  (select jsonb_build_object('id', id, 'hash', entry_hash) from old_audit_row),
  'the run keeps the last pruned row''s hash as the new anchor'
);
select is(
  (select prev_hash from public.audit_logs order by id limit 1),
  (select entry_hash from old_audit_row),
  'the first remaining row links to that anchor'
);
select is((internal.verify_audit_chain() ->> 'ok')::boolean, true, 'and what remains still verifies');

select * from finish();
rollback;
