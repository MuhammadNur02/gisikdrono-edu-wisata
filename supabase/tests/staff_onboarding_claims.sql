-- Task P4.8.01 /onboarding (20261103131000, 20261103131100, 20261103131200; docs/Security.md §5.1, §5.2): the invite
-- code is claimed before any QR code, by a live session of the invited address, five tries an hour and one generic
-- refusal; the claim ends the account's other sessions; a factor of an account that never was staff is verified only
-- under an open claim, and an account without a role gets one TOTP factor at most; accepting needs the claiming session
-- at AAL2, exactly one verified factor and an inviter still in good standing, ends every session and bumps
-- claims_version; a revoked or lapsed invite takes its Auth user with it; an inviter who loses their standing loses
-- their open invites; the invited address cannot change; onboarding_state() answers booleans about the caller only.
begin;
select plan(50);
\ir helpers/rls_personas.psql

-- ===== Fixtures =====
-- The persona superadmin invites; inviting needs their own authenticator in good standing.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000c0f01', '00000000-0000-4000-8000-00000000f001', 'HP Super', 'totp', 'verified',
        now(), now());
-- A second superadmin whose account carries two verified factors: not in good standing.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000c00a1', 'super-dua-hp@example.test'),
  ('00000000-0000-4000-8000-0000000c0001', 'calon-satu@example.test'),
  ('00000000-0000-4000-8000-0000000c0002', 'calon-dua@example.test'),
  ('00000000-0000-4000-8000-0000000c0003', 'calon-kedaluwarsa@example.test'),
  ('00000000-0000-4000-8000-0000000c0004', 'calon-dicabut@example.test'),
  ('00000000-0000-4000-8000-0000000c0005', 'calon-super@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active) values
  ('00000000-0000-4000-8000-0000000c00a1', 'super-dua-hp@example.test', 'Super Dua HP', 'superadmin', null, true),
  ('00000000-0000-4000-8000-0000000c0001', 'calon-satu@example.test', 'calon-satu', 'none', null, false),
  ('00000000-0000-4000-8000-0000000c0002', 'calon-dua@example.test', 'calon-dua', 'none', null, false),
  ('00000000-0000-4000-8000-0000000c0003', 'calon-kedaluwarsa@example.test', 'calon-kedaluwarsa', 'none', null, false),
  ('00000000-0000-4000-8000-0000000c0004', 'calon-dicabut@example.test', 'calon-dicabut', 'none', null, false),
  ('00000000-0000-4000-8000-0000000c0005', 'calon-super@example.test', 'calon-super', 'none', null, false);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000c0fa1', '00000000-0000-4000-8000-0000000c00a1', 'HP 1', 'totp', 'verified', now(), now()),
  ('00000000-0000-4000-8000-0000000c0fa2', '00000000-0000-4000-8000-0000000c00a1', 'HP 2', 'totp', 'verified', now(), now());
insert into public.staff_invites (id, email, role, rw_id, invite_code_hash, expires_at, created_by) values
  ('00000000-0000-4000-8000-0000000c0b01', 'calon-satu@example.test', 'admin_rw', 5, repeat('1', 64),
   now() + interval '72 hours', '00000000-0000-4000-8000-00000000f001'),
  ('00000000-0000-4000-8000-0000000c0b02', 'calon-dua@example.test', 'admin_rw', 8, repeat('2', 64),
   now() + interval '72 hours', '00000000-0000-4000-8000-0000000c00a1'),
  ('00000000-0000-4000-8000-0000000c0b03', 'calon-kedaluwarsa@example.test', 'admin_rw', 5, repeat('3', 64),
   now() + interval '1 minute', '00000000-0000-4000-8000-00000000f001'),
  ('00000000-0000-4000-8000-0000000c0b04', 'calon-dicabut@example.test', 'admin_rw', 13, repeat('4', 64),
   now() + interval '72 hours', '00000000-0000-4000-8000-0000000c00a1');
select set_config('app.privileged_rpc', 'on', true);
insert into public.staff_invites (id, email, role, rw_id, invite_code_hash, expires_at, created_by)
values ('00000000-0000-4000-8000-0000000c0b05', 'calon-super@example.test', 'superadmin', null, repeat('5', 64),
        now() + interval '72 hours', '00000000-0000-4000-8000-00000000f001');
select set_config('app.privileged_rpc', '', true);
-- The browser that opened the invite link, and one more session of the same mailbox elsewhere.
insert into auth.sessions (id, user_id, aal) values
  ('00000000-0000-4000-8000-0000000c05a1', '00000000-0000-4000-8000-0000000c0001', 'aal1'),
  ('00000000-0000-4000-8000-0000000c05a2', '00000000-0000-4000-8000-0000000c0001', 'aal1'),
  ('00000000-0000-4000-8000-0000000c05b1', '00000000-0000-4000-8000-0000000c0002', 'aal1'),
  ('00000000-0000-4000-8000-0000000c05e1', '00000000-0000-4000-8000-0000000c0005', 'aal1');

create function pg_temp.claim(p_user uuid, p_session uuid, p_hash text) returns boolean
  language sql
as $$ select (public.svc_claim_staff_invite(p_user, p_session, p_hash) ->> 'claimed')::boolean; $$;
create function pg_temp.accept(p_user uuid, p_session uuid, p_hash text) returns boolean
  language sql
as $$ select (public.svc_accept_staff_invite(p_user, p_session, p_hash) ->> 'accepted')::boolean; $$;
create function pg_temp.factor(p_id uuid, p_user uuid, p_type text, p_status text) returns void
  language sql
as $$
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (p_id, p_user, 'HP ' || p_id, p_type::auth.factor_type, p_status::auth.factor_status, now(), now());
$$;

-- ===== The factor guard before any claim =====
select lives_ok($$select pg_temp.factor('00000000-0000-4000-8000-0000000c0f11', '00000000-0000-4000-8000-0000000c0001', 'totp', 'unverified')$$,
  'an invited account may start an enrolment');
select throws_ok($$update auth.mfa_factors set status = 'verified' where id = '00000000-0000-4000-8000-0000000c0f11'$$,
  '42501', null, 'but its factor is not verified, through GoTrue''s path, without a claimed invite');
select throws_ok($$select pg_temp.factor('00000000-0000-4000-8000-0000000c0f12', '00000000-0000-4000-8000-0000000c0001', 'totp', 'verified')$$,
  '42501', null, 'nor written verified at once');
select throws_ok($$select pg_temp.factor('00000000-0000-4000-8000-0000000c0f13', '00000000-0000-4000-8000-0000000c0001', 'phone', 'unverified')$$,
  '42501', null, 'and an account without a role enrols no factor but TOTP');

-- ===== Claiming =====
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a1', repeat('9', 64)),
  false, 'a wrong code claims nothing');
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a1', repeat('2', 64)),
  false, 'nor does another address''s code');
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05b1', repeat('1', 64)),
  false, 'nor the right code from a session that is not the account''s');
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a1', repeat('1', 64)),
  true, 'the right code from the account''s own session claims its invite');
select is((select (i.claimed_user_id, i.claimed_session_id, i.claimed_at = now())::text from public.staff_invites i
           where i.id = '00000000-0000-4000-8000-0000000c0b01'),
  ('00000000-0000-4000-8000-0000000c0001'::uuid, '00000000-0000-4000-8000-0000000c05a1'::uuid, true)::text,
  'the claim names the account, the session and the time');
select is(array(select s.id::text from auth.sessions s where s.user_id = '00000000-0000-4000-8000-0000000c0001'),
  array['00000000-0000-4000-8000-0000000c05a1'], 'and ends the account''s other sessions');
select is((select (e.severity::text, e.details ->> 'sessions_ended') from public.security_events e
           where e.event_type = 'invite_claimed' and e.entity_id = '00000000-0000-4000-8000-0000000c0b01')::text,
  '(high,1)', 'a claim that ended another session is a high event');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'login_failed' and e.entity_id = '00000000-0000-4000-8000-0000000c0001'
             and e.details ->> 'reason' = 'invite_code'),
  3, 'each refused claim is a login_failed event');
select count(*) from generate_series(1, 5)
where internal.rate_limit_hit('onboarding_claim:user:00000000-0000-4000-8000-0000000c0002', 5, 3600);
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000c05b1', repeat('2', 64)),
  false, 'a sixth try in the hour claims nothing, the right code included');
select throws_ok($$update public.staff_invites set claimed_at = now() where id = '00000000-0000-4000-8000-0000000c0b02'$$,
  '42501', null, 'and nobody writes a claim by hand');

-- ===== The factor guard under the claim =====
select lives_ok($$update auth.mfa_factors set status = 'verified' where id = '00000000-0000-4000-8000-0000000c0f11'$$,
  'under its claim the account verifies its factor');
select throws_ok($$select pg_temp.factor('00000000-0000-4000-8000-0000000c0f14', '00000000-0000-4000-8000-0000000c0001', 'totp', 'unverified')$$,
  '42501', null, 'and enrols no second one');

-- L1 of the review of PR #77 (20261103131400): another session of the mailbox opened after the claim blocks
-- verification, so only the session that typed the code verifies the factor.
insert into auth.sessions (id, user_id, aal)
values ('00000000-0000-4000-8000-0000000c05d1', '00000000-0000-4000-8000-0000000c0004', 'aal1');
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0004', '00000000-0000-4000-8000-0000000c05d1', repeat('4', 64)),
  true, 'a claim from the account''s one session');
insert into auth.sessions (id, user_id, aal)
values ('00000000-0000-4000-8000-0000000c05d2', '00000000-0000-4000-8000-0000000c0004', 'aal1');
select throws_ok($$select pg_temp.factor('00000000-0000-4000-8000-0000000c0f41', '00000000-0000-4000-8000-0000000c0004', 'totp', 'verified')$$,
  '42501', null, 'is not enough once another session of the mailbox has opened since');

-- ===== Accepting =====
select is(pg_temp.accept('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a1', repeat('1', 64)),
  false, 'an AAL1 session accepts nothing');
update auth.sessions set aal = 'aal2' where id = '00000000-0000-4000-8000-0000000c05a1';
insert into auth.sessions (id, user_id, aal) values
  ('00000000-0000-4000-8000-0000000c05a3', '00000000-0000-4000-8000-0000000c0001', 'aal2');
select is(pg_temp.accept('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a3', repeat('1', 64)),
  false, 'nor does an AAL2 session that did not claim the invite');
select is(pg_temp.accept('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a1', repeat('9', 64)),
  false, 'nor the claiming session with a wrong code');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a1', repeat('1', 64)),
  '{"role": "admin_rw", "rw_id": 5, "accepted": true}', 'the claiming session at AAL2 with the code gets the role');
select is((select (p.role::text, p.rw_id, p.is_active, p.claims_version)::text from public.profiles p
           where p.id = '00000000-0000-4000-8000-0000000c0001'),
  '(admin_rw,5,t,2)', 'the account is active with its role, and its claims_version moved on');
select is((select count(*)::int from auth.sessions s where s.user_id = '00000000-0000-4000-8000-0000000c0001'), 0,
  'every session of the account ended with it');
select is((select (i.accepted_user_id, i.accepted_at is not null)::text from public.staff_invites i
           where i.id = '00000000-0000-4000-8000-0000000c0b01'),
  ('00000000-0000-4000-8000-0000000c0001'::uuid, true)::text, 'the code is consumed');
insert into auth.sessions (id, user_id, aal) values
  ('00000000-0000-4000-8000-0000000c05a4', '00000000-0000-4000-8000-0000000c0001', 'aal2');
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c05a4', repeat('1', 64)),
  false, 'and an account that is staff claims nothing again');

-- An inviter with two verified factors is not in good standing (RW 08's invite).
select set_config('request.jwt.claims', '', true);
delete from public.rate_limit_buckets where key = 'onboarding_claim:user:00000000-0000-4000-8000-0000000c0002';
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000c05b1', repeat('2', 64)),
  true, 'an invite of a superadmin out of standing can still be claimed');
select pg_temp.factor('00000000-0000-4000-8000-0000000c0f21', '00000000-0000-4000-8000-0000000c0002', 'totp', 'verified');
update auth.sessions set aal = 'aal2' where id = '00000000-0000-4000-8000-0000000c05b1';
select is(pg_temp.accept('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000c05b1', repeat('2', 64)),
  false, 'but not accepted');

-- A superadmin invite accepted early reads the same refusal, never an error.
select is(pg_temp.claim('00000000-0000-4000-8000-0000000c0005', '00000000-0000-4000-8000-0000000c05e1', repeat('5', 64)),
  true, 'a superadmin invite is claimed at once');
select pg_temp.factor('00000000-0000-4000-8000-0000000c0f51', '00000000-0000-4000-8000-0000000c0005', 'totp', 'verified');
update auth.sessions set aal = 'aal2' where id = '00000000-0000-4000-8000-0000000c05e1';
select is(pg_temp.accept('00000000-0000-4000-8000-0000000c0005', '00000000-0000-4000-8000-0000000c05e1', repeat('5', 64)),
  false, 'and its acceptance within 24 hours is the generic refusal');
select ok(not has_function_privilege('authenticated', 'public.svc_claim_staff_invite(uuid, uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_accept_staff_invite(uuid, uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.svc_accept_staff_invite(uuid, uuid, text)', 'execute'),
  'claims and acceptances are the server''s alone');

-- ===== onboarding_state() =====
create function pg_temp.state_of(p_user uuid, p_session uuid) returns text
  language plpgsql
as $$
declare
  answer text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated',
    'session_id', p_session, 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
  select s::text into answer from public.onboarding_state() s;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return answer;
end;
$$;
select is(pg_temp.state_of('00000000-0000-4000-8000-0000000c0005', '00000000-0000-4000-8000-0000000c05e1'), '(t,t,t)',
  'an account in onboarding learns its invite is open, this session holds the claim and its factor is verified');
select is(pg_temp.state_of('00000000-0000-4000-8000-0000000c0005', gen_random_uuid()), '(t,f,t)',
  'another session does not hold the claim');
select is(pg_temp.state_of('00000000-0000-4000-8000-0000000c0001', gen_random_uuid()), '(f,f,f)',
  'an account that is staff is told nothing');
select is(pg_temp.state_of('00000000-0000-4000-8000-0000000c0003', gen_random_uuid()), '(t,f,f)',
  'an account with an open invite and nothing else');
select ok(has_function_privilege('authenticated', 'public.onboarding_state()', 'execute')
          and not has_function_privilege('anon', 'public.onboarding_state()', 'execute')
          and (select p.provolatile = 's' and p.prosecdef and p.pronargs = 0 from pg_proc p
               where p.oid = 'public.onboarding_state()'::regprocedure),
  'onboarding_state() is stable, security definer, without parameters, for signed-in users only');
-- The claim lapses after 30 minutes.
select set_config('app.privileged_rpc', 'on', true);
update public.staff_invites set claimed_at = now() - interval '31 minutes' where id = '00000000-0000-4000-8000-0000000c0b05';
select set_config('app.privileged_rpc', '', true);
select is(pg_temp.state_of('00000000-0000-4000-8000-0000000c0005', '00000000-0000-4000-8000-0000000c05e1'), '(t,f,t)',
  'a claim older than 30 minutes is no longer held');

-- ===== M1 of the review of PR #77: no way around onboarding =====
-- A claimed account with its factor verified, its acceptance not done: the superadmin cannot activate it or give it a
-- role (20261103131300); only accept_staff_invite does.
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.set_staff_status('00000000-0000-4000-8000-0000000c0005', true, 'Bantu petugas baru')$$,
  'P0001', null, 'the superadmin does not reactivate a half-onboarded account');
select throws_ok($$select public.set_staff_role('00000000-0000-4000-8000-0000000c0005', 'admin_rw', 5::smallint)$$,
  'P0001', null, 'nor gives it a role');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== O2: the address stays =====
select throws_ok($$update auth.users set email = 'lain@example.test' where id = '00000000-0000-4000-8000-0000000c0003'$$,
  '42501', null, 'an invited account does not change its address');
select throws_ok($$update auth.users set email_change = 'lain@example.test' where id = '00000000-0000-4000-8000-0000000c0003'$$,
  '42501', null, 'nor asks to');

-- ===== (4) Lapsed and revoked invites take their account =====
select internal.purge_lapsed_invited_accounts();
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000c0003'), 1,
  'an account whose invite is open stays');
update public.staff_invites set expires_at = now() - interval '1 second' where id = '00000000-0000-4000-8000-0000000c0b03';
select ok(internal.purge_lapsed_invited_accounts() >= 1, 'purge/retention deletes the account of a lapsed invite');
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000c0003')
          + (select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000c0003'), 0,
  'its Auth user and its profile');
-- Revoked by the superadmin who made it (the cancelled step of its superadmin_invite alert names them).
select set_config('app.actor_id', '00000000-0000-4000-8000-00000000f001', true);
update public.staff_invites set revoked_at = now() where id = '00000000-0000-4000-8000-0000000c0b05';
select set_config('app.actor_id', '', true);
select is(public.svc_unused_account_of_invite('00000000-0000-4000-8000-0000000c0b05'),
  '00000000-0000-4000-8000-0000000c0005'::uuid, 'a revoked invite names the account the server deletes');
select is(public.svc_unused_account_of_invite('00000000-0000-4000-8000-0000000c0b04'), null::uuid,
  'an open one names none');
select is(public.svc_unused_account_of_invite('00000000-0000-4000-8000-0000000c0b01'), null::uuid,
  'nor an accepted one');

-- ===== (7) An inviter who loses their standing =====
select pg_temp.act_as('superadmin_aal2');
select public.set_staff_status('00000000-0000-4000-8000-0000000c00a1', false, 'Uji pencabutan undangan');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.staff_invites i
           where i.created_by = '00000000-0000-4000-8000-0000000c00a1' and i.accepted_at is null and i.revoked_at is null),
  0, 'deactivating a superadmin revokes the invites they made that were still open');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000c0004', '00000000-0000-4000-8000-0000000c0002')),
  0, 'and releases the accounts behind them, a half-onboarded one included');

-- ===== O5 =====
select internal.run_anomaly_scan();
select is((select a.severity::text from public.security_alerts a
           where a.fingerprint = 'invite_claimed:00000000-0000-4000-8000-0000000c0b01' and a.acknowledged_at is null),
  'high', 'the anomaly scan raises a claim that ended another session');

select * from finish();
rollback;
