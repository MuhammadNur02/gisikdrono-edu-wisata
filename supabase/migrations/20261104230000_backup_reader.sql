-- Review of PR #98, M3 and its delta review, N3 and L2 (Task P5.5.04; docs/Security.md §7.8, RES-01): the weekly
-- backup dumps as a role of its own, never as postgres. backup_reader is the group that role belongs to. It reads the
-- two schemas any restore loads, public and auth, and nothing else: no pg_read_all_data, which would also hand it
-- USAGE on cron, vault and net. It may ask which environment the database belongs to (internal.environment(), the
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

grant usage on schema public, auth to backup_reader;
grant select on all tables in schema public to backup_reader;
grant select on all sequences in schema public to backup_reader;
grant select on all tables in schema auth to backup_reader;
grant select on all sequences in schema auth to backup_reader;
-- The tables later migrations add to public are readable to it too, as postgres creates them.
alter default privileges for role postgres in schema public grant select on tables to backup_reader;
alter default privileges for role postgres in schema public grant select on sequences to backup_reader;

grant usage on schema internal to backup_reader;
grant execute on function internal.environment() to backup_reader;
