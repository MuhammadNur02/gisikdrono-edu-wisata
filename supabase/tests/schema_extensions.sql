-- Structure test for 0001_extensions: extensions in the right schemas, a closed `internal` schema,
-- and no access for anon or authenticated on anything created afterwards.
begin;
select plan(20);

select has_extension('extensions', 'pgcrypto', 'pgcrypto is installed in extensions');
select has_extension('extensions', 'citext', 'citext is installed in extensions');
select has_extension('extensions', 'btree_gist', 'btree_gist is installed in extensions');
select has_extension('extensions', 'pg_trgm', 'pg_trgm is installed in extensions');
select has_extension('extensions', 'pg_net', 'pg_net is installed in extensions');
select has_extension('pg_catalog', 'pg_cron', 'pg_cron is installed in pg_catalog');
select has_extension('vault', 'supabase_vault', 'supabase_vault is installed in vault');

select has_schema('internal', 'the internal schema exists');
select ok(not has_schema_privilege('anon', 'internal', 'usage'), 'anon cannot use internal');
select ok(
  not has_schema_privilege('authenticated', 'internal', 'usage'),
  'authenticated cannot use internal'
);

-- Objects created now play the part of every table and function the later migrations add.
create table public.probe_table (id bigint generated always as identity primary key);
create function public.probe_function() returns integer language sql as 'select 1';
create function internal.probe_function() returns integer language sql as 'select 1';

select ok(
  not has_table_privilege('anon', 'public.probe_table', 'select, insert, update, delete, truncate'),
  'anon gets nothing on a new public table'
);
select ok(
  not has_table_privilege('authenticated', 'public.probe_table', 'select, insert, update, delete, truncate'),
  'authenticated gets nothing on a new public table'
);
select ok(
  not has_sequence_privilege('anon', pg_get_serial_sequence('public.probe_table', 'id'), 'usage, select, update'),
  'anon gets nothing on a new identity sequence'
);
select ok(
  not has_sequence_privilege('authenticated', pg_get_serial_sequence('public.probe_table', 'id'), 'usage, select, update'),
  'authenticated gets nothing on a new identity sequence'
);
select ok(
  not has_function_privilege('anon', 'public.probe_function()', 'execute'),
  'anon cannot execute a new public function'
);
select ok(
  not has_function_privilege('authenticated', 'public.probe_function()', 'execute'),
  'authenticated cannot execute a new public function'
);
select ok(
  not has_function_privilege('anon', 'internal.probe_function()', 'execute'),
  'anon cannot execute a new internal function (PUBLIC execute is gone)'
);
select ok(
  not has_function_privilege('authenticated', 'internal.probe_function()', 'execute'),
  'authenticated cannot execute a new internal function (PUBLIC execute is gone)'
);

-- The global revoke must not reach the extensions, or every citext comparison would fail for anon.
select ok(
  has_function_privilege('anon', 'extensions.citext_eq(extensions.citext, extensions.citext)', 'execute'),
  'anon can still compare citext values'
);
select ok(
  has_function_privilege('anon', 'extensions.similarity(text, text)', 'execute'),
  'anon can still use trigram similarity'
);

select * from finish();
rollback;
