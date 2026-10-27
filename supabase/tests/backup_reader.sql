-- Review of PR #98, M3, and its delta review, N3, L1 and L3 (20261104230000_backup_reader.sql; docs/Security.md
-- §7.8): the backup's group role reads public and auth and asks the database's environment, and nothing more. It
-- cannot log in or hold a power, no role here uses it (the owner's login role exists on production only), it reaches
-- no cron, vault or net function, and every table of auth is classified, so a new one fails here until the backup
-- decides whether its rows are copied.
begin;
select plan(17);

-- ===== The role itself =====

select ok((select not rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb and not rolreplication
                  and not rolbypassrls
           from pg_roles where rolname = 'backup_reader'),
  'backup_reader cannot log in and holds no power');
select ok(not pg_has_role('backup_reader', 'pg_read_all_data', 'member')
          and not pg_has_role('backup_reader', 'pg_write_all_data', 'member'),
  'it holds neither pg_read_all_data, which would open cron, vault and net, nor pg_write_all_data');
select is((select count(*)::int from pg_auth_members m
           where m.roleid = 'backup_reader'::regrole and (m.inherit_option or m.set_option)),
  0, 'no role here uses it: the login role gisikdrono_backup exists on production only');
select ok(not pg_has_role('authenticator', 'backup_reader', 'member')
          and not pg_has_role('anon', 'backup_reader', 'member')
          and not pg_has_role('authenticated', 'backup_reader', 'member')
          and not pg_has_role('service_role', 'backup_reader', 'member'),
  'neither the API''s login role nor any API role holds it');

-- ===== What it reads =====

select ok(has_table_privilege('backup_reader', 'public.bookings', 'select')
          and has_table_privilege('backup_reader', 'auth.users', 'select'),
  'it reads the tables of public and auth');
select ok(not has_table_privilege('backup_reader', 'public.bookings', 'insert, update, delete, truncate'),
  'and writes none');
select ok(not has_schema_privilege('backup_reader', 'cron', 'usage')
          and not has_schema_privilege('backup_reader', 'vault', 'usage')
          and not has_schema_privilege('backup_reader', 'net', 'usage'),
  'it may not use cron, vault or net');
select is(
  array(
    select p.proname::text from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal' and has_function_privilege('backup_reader', p.oid, 'execute')
    order by 1
  ),
  array['environment'],
  'of the internal functions it calls environment() alone'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and has_schema_privilege('backup_reader', n.oid, 'usage')
      and has_function_privilege('backup_reader', p.oid, 'execute')
      and not (n.nspname = 'internal' and p.proname = 'environment')
    order by 1
  ),
  array[]::text[],
  'and no other security definer function it can reach'
);

-- ===== Every auth table is classified =====

-- Copied: the staff accounts and their sign-in links. backup.yml excludes the data of the rest (sessions, tokens,
-- factors, challenges, the Auth server's own bookkeeping and its audit), and part E of restore-drills.md recreates
-- what a restore needs. A table of a later GoTrue lands in neither list and stops this suite.
select is(
  array(
    select t.tablename::text from pg_tables t
    where t.schemaname = 'auth'
      and t.tablename not in ('users', 'identities', 'sso_providers', 'sso_domains', 'saml_providers')
      -- backup.yml excludes:
      and t.tablename not in ('refresh_tokens', 'sessions', 'one_time_tokens', 'flow_state', 'mfa_challenges', 'mfa_factors', 'mfa_amr_claims', 'saml_relay_states', 'audit_log_entries', 'schema_migrations', 'instances')
      and t.tablename not like 'oauth\_%'
      and t.tablename not like 'webauthn\_%'
    order by 1
  ),
  array[]::text[],
  'every table of auth is either copied or has its data left out of the backup'
);

-- ===== As the role =====

do $$
begin
  execute format('grant backup_reader to %I with inherit false, set true', current_user);
end;
$$;
set local role backup_reader;
select lives_ok($$select count(*) from public.rw_units$$, 'as backup_reader, a table of public reads');
select lives_ok($$select internal.environment()$$, 'and it learns the environment');
select throws_ok($$select count(*) from vault.decrypted_secrets$$, '42501', null, 'but reads no decrypted secret');
select throws_ok($$select cron.schedule('uji-backup', '* * * * *', 'select 1')$$, '42501', null,
  'schedules no cron job');
select throws_ok($$select net.http_get('https://example.test')$$, '42501', null, 'sends no request through net');
select throws_ok($$select vault.create_secret('uji', 'uji-backup')$$, '42501', null, 'creates no secret');
select throws_ok($$select vault.update_secret(gen_random_uuid(), 'uji')$$, '42501', null, 'and changes none');
reset role;

select * from finish();
rollback;
