-- Reviews of PR #98: M3, delta N3, L1 and L3, third D1 and I5, fourth H1 and H2 (20261104230000_backup_reader.sql;
-- docs/Security.md §7.8). The backup's group role reads public, asks the database's environment and takes the auth
-- snapshot, and nothing more. It cannot log in or hold a power, no role here uses it (the owner's login role exists on
-- production only), it has no USAGE on auth and reaches no cron, vault or net function, and every table of auth is
-- classified, so a new one fails here until the backup decides whether the snapshot copies its rows. The reads are
-- tried as the role itself, not only read off the grants. Follow-ups of the review (20261105110100): every table and
-- sequence of public is readable to the role, so a new one cannot silently miss the dump, and the snapshot refuses a
-- session that cannot act as the role.
begin;
select plan(28);

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

-- ===== What it may use =====

-- backup.yml schemas:
select ok((select bool_and(has_schema_privilege('backup_reader', s, 'usage')) from unnest(array['public']) as s),
  'it may use every schema backup.yml hands pg_dump');
select ok(not has_schema_privilege('backup_reader', 'auth', 'usage'),
  'and has no USAGE on auth: the snapshot reads auth for it');
select is(
  array(
    select t.tablename::text from pg_tables t
    where t.schemaname = 'auth'
      and has_table_privilege('backup_reader', format('%I.%I', t.schemaname, t.tablename)::regclass,
                              'select, insert, update, delete, truncate, references, trigger')
    order by 1
  ),
  array[]::text[],
  'no table of auth grants it anything'
);
select ok(has_table_privilege('backup_reader', 'public.bookings', 'select'), 'it reads the tables of public');
-- The default privileges of 20261104230000 cover what postgres creates later; a table made by another role, or a grant
-- taken back, would leave its rows out of every backup without a word.
select is(
  array(
    select t.tablename::text from pg_tables t
    where t.schemaname = 'public'
      and not has_table_privilege('backup_reader', format('%I.%I', t.schemaname, t.tablename)::regclass, 'select')
    order by 1
  ),
  array[]::text[],
  'every table of public is readable to it, so none is left out of the dump'
);
select is(
  array(
    select c.relname::text from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and not has_sequence_privilege('backup_reader', c.oid, 'select')
    order by 1
  ),
  array[]::text[],
  'and so is every sequence of public'
);
select ok(not has_table_privilege('backup_reader', 'public.bookings', 'insert, update, delete, truncate'),
  'and writes none');
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
  array['backup_auth_snapshot', 'environment'],
  'of the internal functions it calls backup_auth_snapshot() and environment() alone'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and has_schema_privilege('backup_reader', n.oid, 'usage')
      and has_function_privilege('backup_reader', p.oid, 'execute')
      and not (n.nspname = 'internal' and p.proname in ('environment', 'backup_auth_snapshot'))
    order by 1
  ),
  array[]::text[],
  'and no other security definer function it can reach'
);
select ok(not has_function_privilege('authenticated', 'internal.backup_auth_snapshot()', 'execute')
          and not has_function_privilege('anon', 'internal.backup_auth_snapshot()', 'execute')
          and not has_function_privilege('service_role', 'internal.backup_auth_snapshot()', 'execute'),
  'no API role takes the auth snapshot');
-- The guard itself, before the suite's session joins the group below: postgres, which created the group and so holds
-- only its ADMIN membership, may execute the function as its owner and is still refused.
select throws_ok('select internal.backup_auth_snapshot()', '42501', 'the auth snapshot is read by the backup role only',
  'a session whose login role cannot act as backup_reader is refused the auth snapshot');
-- Third review, I5: every table postgres creates sits in public or internal, or in the CLI's own migration history; a
-- table made anywhere else would be neither backed up nor classified.
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

-- ===== Every auth table is classified =====

-- The snapshot copies the staff accounts, their identities and the SSO settings; the rest of auth (sessions, tokens,
-- factors, challenges, OAuth, the Auth server's own bookkeeping and its audit) is never in a backup, and part E of
-- restore-drills.md recreates what a restore needs. A table of a later GoTrue lands in neither list and stops this
-- suite.
select is(
  array(
    select t.tablename::text from pg_tables t
    where t.schemaname = 'auth'
      -- the snapshot copies:
      and t.tablename not in ('users', 'identities', 'sso_providers', 'sso_domains', 'saml_providers')
      and t.tablename not in ('refresh_tokens', 'sessions', 'one_time_tokens', 'flow_state', 'mfa_challenges', 'mfa_factors', 'mfa_amr_claims', 'saml_relay_states', 'audit_log_entries', 'schema_migrations', 'instances', 'custom_oauth_providers')
      and t.tablename not like 'oauth\_%'
      and t.tablename not like 'webauthn\_%'
    order by 1
  ),
  array[]::text[],
  'every table of auth is either copied by the snapshot or never backed up'
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

-- The suite's own session joins the group for this transaction, as gisikdrono_backup belongs to it on production.
do $$
begin
  execute format('grant backup_reader to %I with inherit false, set true', current_user);
end;
$$;
set local role backup_reader;
insert into attempts values
  ('public', pg_temp.attempt('select count(*) from public.rw_units')),
  ('environment', pg_temp.attempt('select internal.environment()')),
  ('snapshot', pg_temp.attempt('select internal.backup_auth_snapshot()')),
  ('auth.users', pg_temp.attempt('select count(*) from auth.users')),
  ('decrypted_secrets', pg_temp.attempt('select count(*) from vault.decrypted_secrets')),
  ('cron.schedule', pg_temp.attempt($q$select cron.schedule('uji-backup', '* * * * *', 'select 1')$q$)),
  ('net.http_get', pg_temp.attempt($q$select net.http_get('https://example.test')$q$)),
  ('vault.create_secret', pg_temp.attempt($q$select vault.create_secret('uji', 'uji-backup')$q$));
reset role;

select is((select outcome from attempts where label = 'public'), 'ok', 'as backup_reader, a table of public reads');
select is((select outcome from attempts where label = 'environment'), 'ok', 'it learns the environment');
select is((select outcome from attempts where label = 'snapshot'), 'ok', 'and takes the auth snapshot');
select is((select outcome from attempts where label = 'auth.users'), '42501', 'but reads no auth table itself');
select is((select outcome from attempts where label = 'decrypted_secrets'), '42501', 'reads no decrypted secret');
select is((select outcome from attempts where label = 'cron.schedule'), '42501', 'schedules no cron job');
select is((select outcome from attempts where label = 'net.http_get'), '42501', 'sends no request through net');
select is((select outcome from attempts where label = 'vault.create_secret'), '42501', 'and creates no secret');
select ok(internal.backup_auth_snapshot() ?& array['users', 'identities', 'sso_providers', 'sso_domains', 'saml_providers'],
  'the snapshot answers the five tables, each as an array of rows');
-- A pending reset link on a staff account must not travel with the backup.
update auth.users set recovery_token = 'pending-reset', reauthentication_token = 'pending-reauth'
  where id = (select id from auth.users order by id limit 1);
select ok((select count(*) from auth.users where recovery_token = 'pending-reset') <= 1
          and not exists (select 1 from jsonb_array_elements(internal.backup_auth_snapshot()->'users') u
            where u->>'recovery_token' <> '' or u->>'confirmation_token' <> '' or u->>'reauthentication_token' <> ''
               or u->>'email_change_token_new' <> '' or u->>'email_change_token_current' <> '' or u->>'phone_change_token' <> ''),
  'the snapshot blanks every one-time token');

select * from finish();
rollback;
