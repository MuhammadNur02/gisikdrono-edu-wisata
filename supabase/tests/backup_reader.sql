-- Review of PR #98, M3 (20261104190700_backup_reader.sql; docs/Security.md §7.8): the backup's group role reads every
-- table and asks the database's environment, and nothing more: it cannot log in, write, use any other internal
-- function, or reach the API.
begin;
select plan(7);

select ok(not (select rolcanlogin from pg_roles where rolname = 'backup_reader'),
  'backup_reader cannot log in; the owner''s login role belongs to it');
select ok(pg_has_role('backup_reader', 'pg_read_all_data', 'member'), 'it reads every table');
select ok(not pg_has_role('backup_reader', 'pg_write_all_data', 'member'), 'and writes none');
select ok(has_function_privilege('backup_reader', 'internal.environment()', 'execute'),
  'it may ask which environment the database belongs to');
select is(
  array(
    select p.proname::text from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal' and has_function_privilege('backup_reader', p.oid, 'execute')
    order by 1
  ),
  array['environment'],
  'and no other internal function'
);
select ok(not has_table_privilege('backup_reader', 'public.bookings', 'insert, update, delete, truncate'),
  'no table of public is written through it');
select ok(not pg_has_role('anon', 'backup_reader', 'member') and not pg_has_role('authenticated', 'backup_reader', 'member')
          and not pg_has_role('service_role', 'backup_reader', 'member'),
  'no API role holds it');

select * from finish();
rollback;
