-- Behaviour tests for 0004_functions, extended group by group. Runs as postgres, which owns every
-- function here, so internal.* bodies are called directly; the public hooks are checked to refuse
-- anyone but Auth.
begin;
select plan(224);

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

-- ===== Definer template (Task P1.3.04) =====

select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
    order by 1
  ),
  array[]::text[],
  'every function in public and internal pins search_path'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal') and p.prosecdef
      and pg_get_userbyid(p.proowner) <> 'postgres'
    order by 1
  ),
  array[]::text[],
  'every security definer function is owned by postgres'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal')
      and has_function_privilege('anon', p.oid, 'execute')
    order by 1
  ),
  array['public.today_jkt'],
  'anon can execute today_jkt() and nothing else'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal')
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1
  ),
  array['public.aal2', 'public.app_role', 'public.app_rw_id', 'public.is_admin_rw', 'public.is_staff',
        'public.is_superadmin', 'public.owns_any_rw', 'public.owns_rw', 'public.today_jkt'],
  'authenticated can execute the nine RLS helpers and nothing else before 0005'
);

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
-- Put the first superadmin back; later sections sign in as them.
update public.profiles set is_active = true where id = '00000000-0000-4000-8000-000000000001';
select set_config('app.privileged_rpc', '', true);
select set_config('app.actor_id', '', true);

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
values ('00000000-0000-4000-8000-0000000000b1', 5, '2026-11-12', '08:00', '10:00', 'Sesi Pagi', 40),
       ('00000000-0000-4000-8000-0000000000b2', 5, '2026-11-13', '08:00', '10:00', 'Sesi Pagi', 40);

-- As the RW 05 admin.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","app_role":"admin_rw","app_rw_id":5,"claims_version":3}', true);
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
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0001', 'ABCDEFGH11', '2026-11-01', '{}')$$,
  'P0001', 'a quotation is issued only after the phone number is verified',
  'no quotation before the phone is verified'
);
update public.bookings set phone_verified_at = now() where id = '00000000-0000-4000-8000-0000000000e1';
insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot, version) values
  ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0001', 'ABCDEFGH11', '2026-11-01', '{}', 1),
  ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0002', 'ABCDEFGH12', '2026-11-01', '{}', 2),
  ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0003', 'ABCDEFGH13', '2026-11-01', '{}', 3);
select throws_ok(
  $$insert into public.quotations (booking_id, quotation_number, verify_code, valid_until, snapshot, version)
    values ('00000000-0000-4000-8000-0000000000e1', 'SP/GSK/2026/10/0004', 'ABCDEFGH14', '2026-11-01', '{}', 1)$$,
  'P0001', 'a booking gets at most three quotation versions',
  'the fourth quotation is refused'
);

-- Revenue rules: lines add up to 100 at commit; a used rule only closes.
insert into public.revenue_share_rules (id, scope, rw_id, name)
values ('00000000-0000-4000-8000-000000000501', 'package_default', 5, 'Default RW 05');
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
  $$update public.revenue_share_rules set name = 'Default RW 05 v2' where id = '00000000-0000-4000-8000-000000000501'$$,
  'P0001', null, 'a rule the ledger used cannot be renamed'
);
select throws_ok(
  $$update public.revenue_share_rule_lines set pct = 50 where rule_id = '00000000-0000-4000-8000-000000000501'$$,
  'P0001', null, 'nor can its lines move'
);
select lives_ok(
  $$update public.revenue_share_rules set effective_to = '2026-12-31', is_active = false where id = '00000000-0000-4000-8000-000000000501'$$,
  'but it can be closed to make room for a new version'
);

-- Sessions with bookings.
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
values ('00000000-0000-4000-8000-0000000000e1', 5, '00000000-0000-4000-8000-0000000000b1', 1, 40, 'reserved', now());
-- The counter is fenced since group 4; this fixture plays the transition function.
select set_config('app.in_rpc', '1', true);
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
  'P0001', 'a settled payment only changes its status and refunded amount', 'a settled payment is frozen'
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
  '2026-11-13', '2026-11-13', 500000, 500000, 'v1', now());
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
            5, '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2N-05', '2026-11-13',
            '2026-11-13 07:00+07', '2026-11-13 12:00+07', 20, 'k1')$$,
  'P0001', 'a ticket is issued only for a paid booking with a settled payment', 'no ticket for an unpaid booking'
);
insert into public.tickets_qr (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
  valid_from, valid_until, pax_count, key_id)
select '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000e1', l.id, 5,
       '00000000-0000-4000-8000-0000000000b1', 'GSK-7F3K9Q2M-05', '2026-11-12',
       '2026-11-12 07:00+07', '2026-11-12 12:00+07', 40, 'k1'
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
values ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-0000000000e1', 'group', 'SERT/GSK/2026/00001', 'CERTGROUP1', 'SD Negeri Gisikdrono 01', '2026-11-12', '{5}');
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

delete from public.site_settings where key = 'pricing.min_price_per_pax';
select lives_ok(
  $$update public.tour_packages set price_per_pax = 1000 where id = '00000000-0000-4000-8000-0000000000c1'$$,
  'without the setting there is no floor, which is why 0008_seed writes it everywhere'
);

-- ===== Quota =====

insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, status) values
  ('00000000-0000-4000-8000-0000000000b5', 5, '2026-11-20', '08:00', '10:00', 'Sesi Pagi', 10, 'open'),
  ('00000000-0000-4000-8000-0000000000b8', 8, '2026-11-20', '13:00', '15:00', 'Sesi Siang', 10, 'open'),
  ('00000000-0000-4000-8000-0000000000b9', 5, '2026-11-21', '08:00', '10:00', 'Sesi Ditutup', 10, 'closed');
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
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, expires_at)
values ('00000000-0000-4000-8000-0000000000e6', 'GSK-7F3K9Q2P', 'pending_payment', '00000000-0000-4000-8000-0000000000c1',
  '{}', '{5,8}', 'school', 'Dewi Lestari', '+6281234567892', 'dewi@example.test', 3,
  '2026-11-20', '2026-11-20', 75000, 75000, 'v1', now(), now() + interval '2 hours');
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
select throws_ok(
  $$select internal.enqueue_notification('00000000-0000-4000-8000-0000000000e5', 'review_invite', 'email',
      '{"link": "https://gisikdrono.example/reservasi/GSK-7F3K9Q2N?t=abc"}')$$,
  '22023', null, 'params never carry a URL'
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
  $$update public.payment_events set payload = payload - 'customer_details' where event_hash = 'event-hash-1'$$,
  'and the retention run may strip the customer details from an old event'
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
values ('00000000-0000-4000-8000-000000000b01', 'kelurahan', '2026-11-01', '2026-11-30', 300000,
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
  (select (after ? 'full_name') or after::text like '%Andi%' from public.audit_logs where action = 'booking_participants.insert'),
  false,
  'a participant is logged without the name'
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
  (select actor_role || ' ' || (metadata ->> 'deleted') from public.audit_logs where action = 'purge_run'),
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

select * from finish();
rollback;
