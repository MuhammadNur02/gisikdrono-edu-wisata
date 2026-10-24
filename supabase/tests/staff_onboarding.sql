-- Task P4.8.01, P4.8.05 and the staff follow-ups of the security review of PR #43 (20261029080000): a role needs a
-- verified authenticator (M1); an alert is acknowledged once, after it went out, and never by the superadmin whose
-- invite or promotion it reports (M2, L1); every new Auth user gets a profile without a role; an invite is consumed
-- once, for its own address, unexpired, after the account enrolled; and after an MFA reset only the superadmin's
-- one-time code opens re-enrolment, for its own account, once, within 24 hours, wrong codes limited and recorded.
begin;
select plan(35);
\ir helpers/rls_personas.psql

-- ===== Fixtures: two accounts without a role =====
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000e0001', 'baru-satu@example.test'),
  ('00000000-0000-4000-8000-0000000e0002', 'baru-dua@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active) values
  ('00000000-0000-4000-8000-0000000e0001', 'baru-satu@example.test', 'Baru Satu', 'none', null, false),
  ('00000000-0000-4000-8000-0000000e0002', 'baru-dua@example.test', 'Baru Dua', 'none', null, false);
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
reset role;

-- ===== M2, L1: acknowledging an alert =====
insert into public.security_alerts (id, rule, severity, fingerprint, title, details, notified_at) values
  ('00000000-0000-4000-8000-0000000ea001', 'uji_tinggi', 'high', 'uji:tinggi', 'Uji tinggi', '{}', null),
  ('00000000-0000-4000-8000-0000000ea002', 'uji_rendah', 'medium', 'uji:rendah', 'Uji rendah', '{}', null),
  ('00000000-0000-4000-8000-0000000ea003', 'superadmin_promotion', 'critical', 'uji:promosi-sendiri', 'Uji',
   jsonb_build_object('by', '00000000-0000-4000-8000-00000000f001', 'user_id', '00000000-0000-4000-8000-0000000e0002'),
   now()),
  ('00000000-0000-4000-8000-0000000ea004', 'superadmin_invite', 'critical', 'uji:undangan-lain', 'Uji',
   jsonb_build_object('by', '00000000-0000-4000-8000-0000000e0002'), now());
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
select throws_ok($$select public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', repeat('1', 64))$$,
  'P0001', null, 'an invite waits for the account''s own authenticator');
select pg_temp.enrol('00000000-0000-4000-8000-0000000e0003');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', repeat('9', 64)),
  '{"accepted": false}', 'a wrong code accepts nothing');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', repeat('2', 64)),
  '{"accepted": false}', 'nor does another address''s code');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', repeat('1', 64)),
  '{"role": "admin_rw", "rw_id": 5, "accepted": true}', 'the right code gives the invite''s role');
select is(pg_temp.profile('00000000-0000-4000-8000-0000000e0003'), '(admin_rw,5,t)', 'and activates the account');
select is((select (i.accepted_user_id, i.accepted_at is not null)::text from public.staff_invites i
           where i.id = '00000000-0000-4000-8000-0000000eb001'),
  ('00000000-0000-4000-8000-0000000e0003'::uuid, true)::text, 'the invite is used');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0003', repeat('1', 64)),
  '{"accepted": false}', 'once');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'login_failed' and e.entity_id = '00000000-0000-4000-8000-0000000e0003'),
  2, 'each refused code is a security event');
update public.staff_invites set expires_at = now() - interval '1 second'
where id = '00000000-0000-4000-8000-0000000eb002';
select pg_temp.enrol('00000000-0000-4000-8000-0000000e0002');
select is(public.svc_accept_staff_invite('00000000-0000-4000-8000-0000000e0002', repeat('2', 64)),
  '{"accepted": false}', 'an expired invite accepts nothing');
select ok(not has_function_privilege('authenticated', 'public.svc_accept_staff_invite(uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.svc_accept_staff_invite(uuid, text)', 'execute'),
  'invites are consumed by the server alone');

-- ===== P4.8.05: the re-enrolment code =====
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64))$$,
  'P0001', null, 'no code for an account that still has its authenticator');
select throws_ok($$select public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-00000000f001', repeat('a', 64))$$,
  '42501', null, 'nor for the superadmin''s own');
reset role;
delete from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000e0002';
select pg_temp.act_as('superadmin_aal2');
select is(public.issue_mfa_reenrolment_code('00000000-0000-4000-8000-0000000e0002', repeat('a', 64)),
  now() + interval '24 hours', 'the superadmin issues a code for 24 hours once the factors are gone');
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

select * from finish();
rollback;
