-- Review of PR #98, M3, and its delta review, N3, L1 and L3 (20261104230000_backup_reader.sql; docs/Security.md
-- §7.8): the backup's group role reads public and auth and asks the database's environment, and nothing more. It
-- cannot log in or hold a power, no role here uses it (the owner's login role exists on production only), it reaches
-- no cron, vault or net function, and every table of auth is classified, so a new one fails here until the backup
-- decides whether its rows are copied.
begin;
select plan(19);

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
-- Third review of PR #98, D1: of auth it reads the five tables the backup copies, and no session, token or factor.
select is(
  array(
    select t.tablename::text from pg_tables t
    where t.schemaname = 'auth'
      and has_table_privilege('backup_reader', format('%I.%I', t.schemaname, t.tablename)::regclass, 'select')
    order by 1
  ),
  array['identities', 'saml_providers', 'sso_domains', 'sso_providers', 'users'],
  'of auth it reads exactly the staff accounts, their identities and the SSO settings'
);
-- Delta review I5: every table postgres creates sits in public or internal, the schemas the backup and the migrations
-- cover, or in the CLI's own migration history; a table made anywhere else would be neither backed up nor classified.
select is(
  array(
    select t.schemaname || '.' || t.tablename from pg_tables t
    where t.tableowner = 'postgres'
      and t.schemaname not in ('public', 'internal', 'supabase_migrations')
      -- A session's own temporary tables (pgTAP keeps its counters in one) are never part of the schema.
      and t.schemaname not like 'pg\_temp\_%'
      and t.schemaname not like 'pg\_toast\_temp\_%'
    order by 1
  ),
  array[]::text[],
  'no table that postgres owns lives outside public and internal'
);
-- Supabase lets PUBLIC use some of these schemas; what counts is that nothing names backup_reader itself, and the
-- calls below, made as the role, are refused.
select is((select count(*)::int from pg_namespace n cross join lateral aclexplode(n.nspacl) a
           where n.nspname in ('cron', 'vault', 'net') and a.grantee = 'backup_reader'::regrole),
  0, 'no grant on cron, vault or net names it');
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
      and t.tablename not in ('refresh_tokens', 'sessions', 'one_time_tokens', 'flow_state', 'mfa_challenges', 'mfa_factors', 'mfa_amr_claims', 'saml_relay_states', 'audit_log_entries', 'schema_migrations', 'instances', 'custom_oauth_providers')
      and t.tablename not like 'oauth\_%'
      and t.tablename not like 'webauthn\_%'
    order by 1
  ),
  array[]::text[],
  'every table of auth is either copied or has its data left out of the backup'
);

-- ===== As the role =====

-- pgTAP's own functions live where backup_reader may not reach, so each statement is tried as the role by a pg_temp
-- function that answers 'ok' or the SQLSTATE, and the answers are checked afterwards as postgres.
create function pg_temp.attempt(p_statement text) returns text
  language plpgsql
as $$
begin
  execute p_statement;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;
grant execute on function pg_temp.attempt(text) to backup_reader;
create temp table attempts (label text primary key, outcome text);
grant insert on attempts to backup_reader;

do $$
begin
  execute format('grant backup_reader to %I with inherit false, set true', current_user);
end;
$$;
set local role backup_reader;
insert into attempts values
  ('public', pg_temp.attempt('select count(*) from public.rw_units')),
  ('environment', pg_temp.attempt('select internal.environment()')),
  ('decrypted_secrets', pg_temp.attempt('select count(*) from vault.decrypted_secrets')),
  ('cron.schedule', pg_temp.attempt($q$select cron.schedule('uji-backup', '* * * * *', 'select 1')$q$)),
  ('net.http_get', pg_temp.attempt($q$select net.http_get('https://example.test')$q$)),
  ('vault.create_secret', pg_temp.attempt($q$select vault.create_secret('uji', 'uji-backup')$q$)),
  ('vault.update_secret', pg_temp.attempt($q$select vault.update_secret(gen_random_uuid(), 'uji')$q$));
reset role;

select is((select outcome from attempts where label = 'public'), 'ok', 'as backup_reader, a table of public reads');
select is((select outcome from attempts where label = 'environment'), 'ok', 'and it learns the environment');
select is((select outcome from attempts where label = 'decrypted_secrets'), '42501', 'but reads no decrypted secret');
select is((select outcome from attempts where label = 'cron.schedule'), '42501', 'schedules no cron job');
select is((select outcome from attempts where label = 'net.http_get'), '42501', 'sends no request through net');
select is((select outcome from attempts where label = 'vault.create_secret'), '42501', 'creates no secret');
select is((select outcome from attempts where label = 'vault.update_secret'), '42501', 'and changes none');

select * from finish();
rollback;
