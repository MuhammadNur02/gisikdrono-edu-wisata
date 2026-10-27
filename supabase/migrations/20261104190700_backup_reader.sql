-- Review of PR #98, M3 (Task P5.5.04; docs/Security.md §7.8, RES-01): the weekly backup dumps as a role of its own,
-- never as postgres. backup_reader is the group that role belongs to: it reads every table (pg_read_all_data), and it
-- may ask which environment the database belongs to (internal.environment(), the Vault marker of 0007), so the job
-- refuses a database that is not production before it dumps anything. It cannot log in, write, or call any other
-- internal function. The login role itself, with BYPASSRLS so pg_dump sees every row of the forced-RLS tables, is
-- created by the owner on the production project only, with a password from the vault
-- (docs/runbooks/restore-drills.md, part A); a password never sits in a migration.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader nologin;
  end if;
end;
$$;

grant pg_read_all_data to backup_reader;
grant usage on schema internal to backup_reader;
grant execute on function internal.environment() to backup_reader;
