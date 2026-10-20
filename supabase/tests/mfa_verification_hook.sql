-- The MFA verification hook of 20261020080100_mfa_verification_hook (security review of PR #17, M1; docs/Security.md
-- §5.5): five wrong TOTP codes within 15 minutes lock the account inside Auth, even against the right code. Each wrong
-- code is an mfa_failed event, the lock an mfa_locked event and one open security alert. Runs as postgres, which owns
-- the functions; the hook as Auth calls it is proved through GoTrue in tests/integration/mfa-hook.test.ts.
begin;
select plan(19);

-- Whether this session holds the transaction advisory lock pg_advisory_xact_lock(hashtext(key)), as in
-- schema_functions.sql.
create function pg_temp.holds_advisory_lock(p_key text) returns boolean
  language sql stable
as $$
  select exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1
      and l.classid = ((hashtext(p_key)::bigint >> 32) & 4294967295)::oid
      and l.objid = (hashtext(p_key)::bigint & 4294967295)::oid);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'mfa-hook-1@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'mfa-hook-2@example.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'mfa-hook-3@example.test');

select is(internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', false) ->> 'decision', 'continue', 'wrong code 1 continues');
select is(internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', false) ->> 'decision', 'continue', 'wrong code 2 continues');
select is(internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', false) ->> 'decision', 'continue', 'wrong code 3 continues');
select is(internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', false) ->> 'decision', 'continue', 'wrong code 4 continues');
select is(
  internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', false),
  '{"decision": "reject", "message": "Terlalu banyak kode yang salah. Coba lagi dalam 15 menit."}'::jsonb,
  'the fifth wrong code within 15 minutes locks the account, with an Indonesian message'
);
select is(
  (select string_agg(event_type || ':' || severity, ',' order by id) from public.security_events
   where actor_id = '00000000-0000-4000-8000-0000000000a1'),
  'mfa_failed:info,mfa_failed:info,mfa_failed:info,mfa_failed:info,mfa_failed:info,mfa_locked:high',
  'five mfa_failed events, then one mfa_locked'
);
select is(
  (select string_agg(distinct entity_type || ':' || entity_id, ',') from public.security_events
   where actor_id = '00000000-0000-4000-8000-0000000000a1'),
  'mfa_factor:00000000-0000-4000-8000-0000000000f1',
  'the events name the factor by its id only'
);
select is(
  (select string_agg(details ->> 'failures', ',' order by id) from public.security_events
   where actor_id = '00000000-0000-4000-8000-0000000000a1'),
  '1,2,3,4,5,5',
  'each event counts the failures in the window'
);
select is(
  (select rule || ':' || severity || ':' || occurrences from public.security_alerts
   where fingerprint = 'mfa_locked:00000000-0000-4000-8000-0000000000a1' and acknowledged_at is null),
  'mfa_locked:high:1',
  'the lock opens one high security alert for the account'
);
select is(
  internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', true) ->> 'decision',
  'reject',
  'even the right code is refused while the window is full'
);
select is(
  internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', false) ->> 'decision',
  'reject',
  'and so is another wrong one'
);
select is(
  (select count(*) from public.security_events where actor_id = '00000000-0000-4000-8000-0000000000a1'),
  6::bigint,
  'attempts during the lock write no more events, so guessing on cannot flood security_events'
);
select is(
  (select occurrences from public.security_alerts
   where fingerprint = 'mfa_locked:00000000-0000-4000-8000-0000000000a1' and acknowledged_at is null),
  3,
  'the open alert counts them instead'
);
select ok(
  pg_temp.holds_advisory_lock('mfa_attempts:00000000-0000-4000-8000-0000000000a1'),
  'one account''s attempts take turns, so parallel guesses cannot all see a short count'
);
select is(
  internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000f2', true) ->> 'decision',
  'continue',
  'another account with the right code continues, and nothing is recorded for it'
);

-- Failures older than the window no longer count.
insert into public.security_events (event_type, severity, actor_id, entity_type, details, occurred_at)
select 'mfa_failed', 'info', '00000000-0000-4000-8000-0000000000a3', 'mfa_factor', '{}', now() - interval '16 minutes'
from generate_series(1, 5);
select is(
  internal.record_mfa_attempt('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000f3', true) ->> 'decision',
  'continue',
  'five failures from 16 minutes ago lock nothing: the window opens again on its own'
);

select throws_ok(
  $$select public.hook_mfa_verification_attempt('{"user_id":"00000000-0000-4000-8000-0000000000a2","factor_id":"00000000-0000-4000-8000-0000000000f2","valid":false}')$$,
  '42501', null, 'only Auth may call the MFA hook'
);
select is(
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
   where r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
     and has_function_privilege(r.oid, 'public.hook_mfa_verification_attempt(jsonb)', 'execute')),
  'supabase_auth_admin',
  'Auth is the only API role that can execute the MFA hook'
);
select is(
  (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r
   where r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')
     and has_function_privilege(r.oid, 'internal.record_mfa_attempt(uuid, uuid, boolean)', 'execute')),
  null,
  'no API role can run the lockout itself'
);

select * from finish();
rollback;
