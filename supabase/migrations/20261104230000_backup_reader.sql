-- Review of PR #98, M3 and its delta review, N3 and L2 (Task P5.5.04; docs/Security.md §7.8, RES-01): the weekly
-- backup dumps as a role of its own, never as postgres. backup_reader is the group that role belongs to. It reads the
-- two schemas any restore loads, public whole and of auth only the five tables the backup copies (the staff accounts,
-- their identities and the SSO settings; third review of PR #98, D1), and nothing else: no pg_read_all_data, which
-- would also hand it USAGE on cron, vault and net, and no other auth table, whose sessions, tokens and factors it
-- would read live. It may ask which environment the database belongs to (internal.environment(), the
-- Vault marker of 0007), so the job refuses a database that is not production before it dumps anything. It cannot
-- log in, write, or call any other internal function. The login role gisikdrono_backup, with BYPASSRLS so pg_dump
-- sees every row of the forced-RLS tables, is created by the owner on the production project only, and its password
-- set from psql's \password so no plain password reaches the server (docs/runbooks/restore-drills.md, part A).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader nologin;
  end if;
end;
$$;
-- Whatever an earlier hand may have given it, the group itself never logs in or holds a power.
alter role backup_reader nologin nobypassrls nocreaterole nocreatedb noreplication;
revoke pg_read_all_data, pg_write_all_data from backup_reader;

grant usage on schema public, auth to backup_reader;
grant select on all tables in schema public to backup_reader;
grant select on all sequences in schema public to backup_reader;
grant select on auth.users, auth.identities, auth.sso_providers, auth.sso_domains, auth.saml_providers to backup_reader;
-- The tables later migrations add to public are readable to it too, as postgres creates them.
alter default privileges for role postgres in schema public grant select on tables to backup_reader;
alter default privileges for role postgres in schema public grant select on sequences to backup_reader;

grant usage on schema internal to backup_reader;
grant execute on function internal.environment() to backup_reader;
