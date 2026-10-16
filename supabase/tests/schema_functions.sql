-- Behaviour tests for 0004_functions, extended group by group. Runs as postgres, which owns every
-- function here, so internal.* bodies are called directly; the public hooks are checked to refuse
-- anyone but Auth.
begin;
select plan(48);

-- Fixtures, rolled back at the end. The pepper is a throwaway local value.
select vault.create_secret('local-test-pepper-not-a-real-secret-0000000', 'otp_pepper', 'test only');
insert into public.rw_units (id, code, slug, name, theme_label) values
  (5, 'RW05', 'rw-05-ecowastreme', 'RW 05 Ecowastreme', 'Ekowisata & Lingkungan'),
  (8, 'RW08', 'rw-08-kampung-seni-budaya', 'RW 08 Kampung Seni Budaya', 'Seni & Budaya');
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'superadmin@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'admin05@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'former@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active, claims_version) values
  ('00000000-0000-4000-8000-000000000001', 'superadmin@example.test', 'Super Admin', 'superadmin', null, true, 1),
  ('00000000-0000-4000-8000-000000000002', 'admin05@example.test', 'Admin Lima', 'admin_rw', 5, true, 3),
  ('00000000-0000-4000-8000-000000000003', 'former@example.test', 'Mantan Staf', 'admin_rw', 8, false, 1);

-- ===== Contact masks on bookings =====

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax)
values ('00000000-0000-4000-8000-0000000000c1', 5, 'regular', 'eduwisata-ecowastreme', 'Eduwisata', 25000);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at)
values ('00000000-0000-4000-8000-0000000000e1', 'GSK-7F3K9Q2M', 'quoted', '00000000-0000-4000-8000-0000000000c1',
  '{}', '{5}', 'school', 'Siti Rahmawati', '+6281234567890', 'siti.rahmawati@example.test', 40,
  '2026-11-12', '2026-11-12', 1000000, 1000000, 'v1', now());

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
      'x', 'x@example.test', 40, '2026-11-12', '2026-11-12', 1000000, 1000000, 'v1', now())$$,
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
  encode(extensions.hmac('siti.rahmawati@example.test'::bytea, 'local-test-pepper-not-a-real-secret-0000000'::bytea, 'sha256'), 'hex'),
  'the email hash is HMAC-SHA256 keyed with the Vault pepper'
);
select isnt(
  internal.hash_email('siti.rahmawati@example.test'),
  encode(extensions.digest('siti.rahmawati@example.test', 'sha256'), 'hex'),
  'and not a plain sha256'
);

select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000001', false) ->> 'decision', 'continue', 'failure 1 continues');
select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000001', false) ->> 'decision', 'continue', 'failure 2 continues');
-- Failures 3 and 4 sleep 1 s and 2 s; the delay is the behaviour, so the test pays for it.
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
  (select string_agg(event_type || ':' || severity, ',' order by id) from public.security_events),
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
  (select count(*) from public.security_events where event_type = 'login_locked'),
  1::bigint,
  'one login_locked event per lockout, not one per refused attempt'
);
select is(internal.record_login_attempt('00000000-0000-4000-8000-000000000002', true) ->> 'decision', 'continue', 'another user with a correct password continues');
select throws_ok(
  $$select public.hook_password_verification_attempt('{"user_id":"00000000-0000-4000-8000-000000000001","valid":false}')$$,
  '42501', null, 'only Auth may call the password hook'
);

select * from finish();
rollback;
