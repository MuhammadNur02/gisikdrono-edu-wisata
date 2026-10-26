-- Task P4.8.01, P4.8.05 and the staff follow-ups of the security review of PR #43 (20261029080000): a role needs a
-- verified authenticator (M1); an alert is acknowledged once, after it went out, and never by the superadmin whose
-- invite or promotion it reports (M2, L1); every new Auth user gets a profile without a role; an invite is consumed
-- once, for its own address, unexpired, after the account enrolled; and after an MFA reset only the superadmin's
-- one-time code opens re-enrolment, for its own account, once, within 24 hours, wrong codes limited and recorded.
-- Review of PR #58 (20261029080200): a completed reset leaves the account without a role and unable to verify a new
-- authenticator until the code is used, and every verification is an mfa_enrolled event (H1); nobody an alert names,
-- as subject or actor, acknowledges it, for any rule, and what an alert names is merged, never overwritten (M1); the
-- caller's own row is refused before anything else. An Auth user that never became staff is deleted with its profile;
-- one that ever held a role is not (20261029080300). Using the code opens a ten-minute window and keeps the wait; a
-- factor is verified only inside it, the first one ends the wait, and an abandoned window needs a new code (N1 of the
-- re-review, 20261029080400). Since 20261103131000 an invite is claimed by a live session before the account's factor
-- is verified, and accepted from that session at AAL2; every refusal reads the same.
begin;
select plan(58);
\ir helpers/rls_personas.psql

-- ===== Fixtures: two accounts without a role =====
-- Both held a role once (became_staff_at, claims_version moved on), so they enrol the way a reactivated officer does; an account that
-- never was staff verifies a factor only under a claimed invite (20261103131000, staff_onboarding_claims.sql).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000e0001', 'baru-satu@example.test'),
  ('00000000-0000-4000-8000-0000000e0002', 'baru-dua@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active, claims_version, became_staff_at) values
  ('00000000-0000-4000-8000-0000000e0001', 'baru-satu@example.test', 'Baru Satu', 'none', null, false, 2, now()),
  ('00000000-0000-4000-8000-0000000e0002', 'baru-dua@example.test', 'Baru Dua', 'none', null, false, 2, now());
-- The superadmin who invites keeps their own authenticator (inviter_in_good_standing, 20261103131000).
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000e0f01', '00000000-0000-4000-8000-00000000f001', 'HP Super', 'totp', 'verified',
        now(), now());
create function pg_temp.enrol(p_user uuid) returns void
  language sql
as $$
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), p_user, 'HP', 'totp', 'verified', now(), now());
$$;
create function pg_temp.profile(p_user uuid) returns text
  language sql stable
as $$ select (p.role::text, p.rw_id, p.is_active)::text from public.profiles p where p.id = p_user; $$;

-- ===== M1: a role needs a verified factor =====
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.set_staff_role('00000000-0000-4000-8000-0000000e0001', 'admin_rw', 5::smallint)$$,
  'P0001', null, 'no role goes to an account without its own verified authenticator');
reset role;
select pg_temp.enrol('00000000-0000-4000-8000-0000000e0001');
select pg_temp.act_as('superadmin_aal2');
select is(public.set_staff_role('00000000-0000-4000-8000-0000000e0001', 'admin_rw', 5::smallint),
  '{"stage": "applied"}', 'once it has one, the role goes');
select is(public.set_staff_role('00000000-0000-4000-8000-0000000e0001', 'none'), '{"stage": "applied"}',
  'and taking a role away needs none');
select throws_ok($$select public.set_staff_role('00000000-0000-4000-8000-00000000f001', 'admin_rw', 5::smallint)$$,
  '42501', 'a staff member cannot change their own role or status',
  'the caller''s own row is refused first, whatever its factors');
reset role;

-- ===== M2, L1: acknowledging an alert =====
insert into public.security_alerts (id, rule, severity, fingerprint, title, details, notified_at) values
  ('00000000-0000-4000-8000-0000000ea001', 'uji_tinggi', 'high', 'uji:tinggi', 'Uji tinggi', '{}', null),
  ('00000000-0000-4000-8000-0000000ea002', 'uji_rendah', 'medium', 'uji:rendah', 'Uji rendah', '{}', null),
  ('00000000-0000-4000-8000-0000000ea003', 'superadmin_promotion', 'critical', 'uji:promosi-sendiri', 'Uji',
   jsonb_build_object('by', '00000000-0000-4000-8000-00000000f001', 'user_id', '00000000-0000-4000-8000-0000000e0002'),
   now()),
  ('00000000-0000-4000-8000-0000000ea004', 'superadmin_invite', 'critical', 'uji:undangan-lain', 'Uji',
   jsonb_build_object('by', '00000000-0000-4000-8000-0000000e0002'), now()),
  ('00000000-0000-4000-8000-0000000ea005', 'manual_checkin', 'medium', 'uji:manual-sendiri', 'Uji',
   jsonb_build_object('actor_ids', jsonb_build_array('00000000-0000-4000-8000-00000000f001')), null),
  ('00000000-0000-4000-8000-0000000ea006', 'mfa_reset', 'critical', 'uji:ditimpa', 'Uji',
   jsonb_build_object('by', '00000000-0000-4000-8000-00000000f001', 'stage', 'requested'), now());
-- A later step writes its own details; what the alert named before stays named.
update public.security_alerts
set details = jsonb_build_object('by', '00000000-0000-4000-8000-0000000e0002', 'stage', 'completed', 'user_id', null)
where id = '00000000-0000-4000-8000-0000000ea006';
select is((select (a.details ->> 'stage', a.details ->> 'by',
                   a.details -> 'involved' @> jsonb_build_array('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-0000000e0002'))::text
           from public.security_alerts a where a.id = '00000000-0000-4000-8000-0000000ea006'),
  '(completed,00000000-0000-4000-8000-0000000e0002,t)', 'a later write merges into the details and keeps everyone the alert named');
create function pg_temp.acknowledge(p_alert uuid) returns integer
  language sql
as $$
  select pg_temp.row_count(format('update public.security_alerts set acknowledged_by = %L where id = %L',
                                  auth.uid(), p_alert));
$$;
grant execute on function pg_temp.acknowledge(uuid) to authenticated;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea001'), 0,
  'a high alert is not acknowledged before it went out of band');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea002'), 1, 'a medium one is');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea002'), 0, 'once (L1)');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea003'), 0,
  'the superadmin does not acknowledge the alert of their own promotion request');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea004'), 1,
  'but does acknowledge another''s invite once it went out');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea005'), 0,
  'nor a medium alert of any rule that names them as an actor');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea006'), 0,
  'nor one that named them before a later step rewrote its details');
reset role;
update public.security_alerts set notified_at = now() where id = '00000000-0000-4000-8000-0000000ea001';
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.acknowledge('00000000-0000-4000-8000-0000000ea001'), 1, 'and a high alert once it went out');
reset role;

-- ===== P4.8.01: a profile for every Auth user =====
set constraints auth.handle_new_auth_user immediate;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000e0003', 'diundang@example.test');
select is((select (p.role::text, p.is_active, p.full_name)::text from public.profiles p
           where p.id = '00000000-0000-4000-8000-0000000e0003'),
  ('none', false, 'diundang')::text, 'a new Auth user gets a profile without a role, inactive');
select is(internal.staff_token_claims('00000000-0000-4000-8000-0000000e0003') ->> 'app_role', 'none',
  'which carries no access');

-- ===== P4.8.01: accepting an invite =====
insert into public.staff_invites (id, email, role, rw_id, invite_code_hash, expires_at, created_by) values
  ('00000000-0000-4000-8000-0000000eb001', 'diundang@example.test', 'admin_rw', 5, repeat('1', 64),
   now() + interval '72 hours', '00000000-0000-4000-8000-00000000f001'),
  ('00000000-0000-4000-8000-0000000eb002', 'baru-dua@example.test', 'admin_rw', 8, repeat('2', 64),
   now() + interval '1 minute', '00000000-0000-4000-8000-00000000f001');
-- 20261103131000: the code is claimed by a live session first, and accepted from it at AAL2.
insert into auth.sessions (id, user_id, aal)
values ('00000000-0000-4000-8000-0000000e05a3', '00000000-0000-4000-8000-0000000e0003', 'aal2');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000e05a3', repeat('1', 64)),
  '{"accepted": false}', 'an invite waits for its claim and the account''s own authenticator, with the generic refusal');
select is(public.svc_claim_staff_invite('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000e05a3', repeat('9', 64)),
  '{"claimed": false}', 'a wrong code claims nothing');
select is(public.svc_claim_staff_invite('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000e05a3', repeat('2', 64)),
  '{"claimed": false}', 'nor does another address''s code');
select is(public.svc_claim_staff_invite('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000e05a3', repeat('1', 64)),
  '{"claimed": true}', 'the right code claims the invite');
select pg_temp.enrol('00000000-0000-4000-8000-0000000e0003');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000e05a3', repeat('1', 64)),
  '{"role": "admin_rw", "rw_id": 5, "accepted": true}', 'the right code gives the invite''s role');
select is(pg_temp.profile('00000000-0000-4000-8000-0000000e0003'), '(admin_rw,5,t)', 'and activates the account');
select is((select (i.accepted_user_id, i.accepted_at is not null)::text from public.staff_invites i
           where i.id = '00000000-0000-4000-8000-0000000eb001'),
  ('00000000-0000-4000-8000-0000000e0003'::uuid, true)::text, 'the invite is used');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000e05a3', repeat('1', 64)),
  '{"accepted": false}', 'once');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'login_failed' and e.entity_id = '00000000-0000-4000-8000-0000000e0003'),
  4, 'each refused step is a security event');
update public.staff_invites set expires_at = now() - interval '1 second'
where id = '00000000-0000-4000-8000-0000000eb002';
select pg_temp.enrol('00000000-0000-4000-8000-0000000e0002');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0002', gen_random_uuid(), repeat('2', 64)),
  '{"accepted": false}', 'an expired invite accepts nothing');
-- A server-side step: no signed-in user, the actor it declared.
select set_config('request.jwt.claims', '', true);
select set_config('app.actor_id', '00000000-0000-4000-8000-00000000f005', true);
select internal.record_superadmin_invite_step('00000000-0000-4000-8000-0000000eb001', 'requested');
select set_config('app.actor_id', '', true);
select ok((select a.details -> 'involved' @> jsonb_build_array('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f005') from public.security_alerts a
           where a.fingerprint = 'superadmin_invite:00000000-0000-4000-8000-0000000eb001'),
  'an invite''s alert names its creator and the actor of the step');
select ok(not has_function_privilege('authenticated', 'public.svc_accept_staff_invite(uuid, uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.svc_accept_staff_invite(uuid, uuid, text)', 'execute'),
  'invites are consumed by the server alone');

-- ===== P4.8.05: the re-enrolment code =====
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64))$$,
  'P0001', null, 'no code for an account that still has its authenticator');
select throws_ok($$select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-00000000f001', repeat('a', 64))$$,
  '42501', null, 'nor for the superadmin''s own');
reset role;
delete from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000e0001';
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0001', repeat('a', 64))$$,
  'P0001', null, 'nor for one without a factor whose MFA was never reset');

-- H1: a completed reset leaves the account waiting for the code.
select is(public.reset_staff_mfa('00000000-0000-4000-8000-0000000e0003') ->> 'stage', 'requested', 'an MFA reset is requested first');
select public.reset_staff_mfa('00000000-0000-4000-8000-0000000e0002');
reset role;
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set mfa_reset_requested_at = now() - interval '25 hours' where id in ('00000000-0000-4000-8000-0000000e0002', '00000000-0000-4000-8000-0000000e0003');
select set_config('app.privileged_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is(public.reset_staff_mfa('00000000-0000-4000-8000-0000000e0003') ->> 'stage', 'completed', 'and completed a day later');
select public.reset_staff_mfa('00000000-0000-4000-8000-0000000e0002');
reset role;
select is((select (p.role::text, p.reenrolment_required)::text from public.profiles p where p.id = '00000000-0000-4000-8000-0000000e0003'),
  '(admin_rw,t)', 'the account keeps its role but waits for its re-enrolment code');
select is(internal.staff_token_claims('00000000-0000-4000-8000-0000000e0003') ->> 'app_role', 'none', 'and its token carries no role meanwhile');
select throws_ok($$select pg_temp.enrol('00000000-0000-4000-8000-0000000e0003')$$, '42501', null,
  'a new authenticator is not verified without the code');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000ec001', '00000000-0000-4000-8000-0000000e0003', 'HP Baru', 'totp', 'unverified', now(), now());
select throws_ok($$update auth.mfa_factors set status = 'verified' where id = '00000000-0000-4000-8000-0000000ec001'$$,
  '42501', null, 'nor moved to verified, the way GoTrue verifies it');
set local role service_role;
select throws_ok($$update public.profiles set reenrolment_required = false where id = '00000000-0000-4000-8000-0000000e0003'$$,
  '42501', null, 'and the wait is not lifted by a plain update, not even the server''s');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64)),
  now() + interval '24 hours', 'the superadmin issues a code for 24 hours once the reset completed');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64))$$,
  '42501', null, 'an RW admin issues none');
reset role;
select is((select count(*)::int from public.security_alerts a
           where a.fingerprint = 'mfa_reset:00000000-0000-4000-8000-0000000e0002'
             and a.details ->> 'stage' = 'reenrolment_code_issued'),
  1, 'its issue raises the mfa_reset alert');
select is(public.svc_check_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('b', 64)), false,
  'a wrong code opens nothing');
select is(public.svc_check_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64)), true,
  'the right one opens enrolment, without being used');
select is(public.svc_consume_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0001', repeat('a', 64)), false,
  'another account cannot use it');
select is(public.svc_consume_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64)), true,
  'its own account uses it');
select is(public.svc_consume_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64)), false,
  'once');
select is((select (p.reenrolment_required, p.reenrolment_window_until > now(),
                   p.reenrolment_window_until <= now() + interval '10 minutes')::text
           from public.profiles p where p.id = '00000000-0000-4000-8000-0000000e0002'),
  '(t,t,t)', 'using it keeps the wait and opens a ten-minute window');
select lives_ok($$select pg_temp.enrol('00000000-0000-4000-8000-0000000e0002')$$, 'inside it the new authenticator is verified');
select is((select (p.reenrolment_required, p.reenrolment_window_until is null)::text
           from public.profiles p where p.id = '00000000-0000-4000-8000-0000000e0002'),
  '(f,t)', 'and the first verified factor ends the wait and the window');
-- An officer who uses the code and walks away: the window closes, and the password alone enrols nothing later.
select pg_temp.act_as('superadmin_aal2');
select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0003', repeat('d', 64));
reset role;
select public.svc_consume_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0003', repeat('d', 64));
update public.profiles set reenrolment_window_until = now() - interval '1 second' where id = '00000000-0000-4000-8000-0000000e0003';
select throws_ok($$update auth.mfa_factors set status = 'verified' where id = '00000000-0000-4000-8000-0000000ec001'$$,
  '42501', null, 'after an abandoned window a later enrolment through GoTrue is refused');
select is((select p.reenrolment_required from public.profiles p where p.id = '00000000-0000-4000-8000-0000000e0003'), true,
  'the account still waits');
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0003', repeat('e', 64))$$,
  'and needs a new code from the superadmin');
reset role;
select is((select count(*)::int from public.security_events e
           where e.event_type = 'mfa_enrolled' and e.entity_id = '00000000-0000-4000-8000-0000000e0002'),
  2, 'and every verified authenticator, the first one too, is an mfa_enrolled event');
select is((select (count(*) filter (where e.event_type = 'mfa_failed'),
                   count(*) filter (where e.event_type = 'mfa_reset' and e.details ->> 'stage' = 'reenrolment_code_used'))::text
           from public.security_events e
           where e.entity_id in ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000e0002')),
  '(3,1)', 'wrong codes are recorded, and the use raises the mfa_reset alert');
-- An expired code, and a sixth try in the hour, open nothing.
update public.profiles set mfa_reenrol_code_hash = repeat('c', 64), mfa_reenrol_expires_at = now() - interval '1 second'
where id = '00000000-0000-4000-8000-0000000e0001';
select is(public.svc_check_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0001', repeat('c', 64)), false,
  'an expired code opens nothing');
update public.profiles set mfa_reenrol_expires_at = now() + interval '1 hour'
where id = '00000000-0000-4000-8000-0000000e0001';
select count(*) from generate_series(1, 5)
where internal.rate_limit_hit('mfa_reenrol:user:00000000-0000-4000-8000-0000000e0001', 5, 3600);
select is(public.svc_check_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0001', repeat('c', 64)), false,
  'nor does a sixth try in the hour, the right code included');
select ok(not has_function_privilege('authenticated', 'public.svc_consume_mfa_reenrolment_code(uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_check_mfa_reenrolment_code(uuid, text)', 'execute'),
  'the code is checked and used by the server alone');

-- ===== Deleting an Auth user =====
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000e0004', 'salah-ketik@example.test');
delete from auth.users where id = '00000000-0000-4000-8000-0000000e0004';
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000e0004'), 0,
  'an Auth user that never became staff is deleted with its profile');
select throws_ok($$delete from auth.users where id = '00000000-0000-4000-8000-0000000e0001'$$, '23503', null,
  'one whose profile ever held a role is not: it is deactivated, and the audit trail keeps naming it');

select * from finish();
rollback;
