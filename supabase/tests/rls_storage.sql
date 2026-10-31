-- Storage buckets and the absence of storage.objects policies (docs/PRD.md §8.8, docs/Security.md §6.8, UPL-02 to
-- UPL-05, Task P1.5.01, P1.5.02, security review of PR #5). Every check runs as an API role. The Storage API itself
-- sets storage.allow_delete_query before it deletes a row, so the delete checks set it too and test the policies,
-- not Supabase's own guard.
begin;
select plan(27);
\ir helpers/rls_personas.psql

insert into storage.objects (bucket_id, name) values
  ('public-media', 'rw-05/gallery/fixture-05.webp'),
  ('public-media', 'rw-08/gallery/fixture-08.webp'),
  ('public-media', 'kelurahan/hero/fixture-kel.webp'),
  ('uploads-quarantine', 'rw-05/00000000-0000-4000-8000-0000000c0a01'),
  ('documents', 'bookings/00000000-0000-4000-8000-0000000c0a02/ticket.pdf');
create function pg_temp.fixture_count() returns integer
  language sql stable
as $$
  select count(*)::int from storage.objects
  where name in ('rw-05/gallery/fixture-05.webp', 'rw-08/gallery/fixture-08.webp', 'kelurahan/hero/fixture-kel.webp',
                 'rw-05/00000000-0000-4000-8000-0000000c0a01', 'bookings/00000000-0000-4000-8000-0000000c0a02/ticket.pdf');
$$;
grant execute on function pg_temp.fixture_count() to anon, authenticated;

-- ===== Buckets =====
select is(
  (select string_agg(id || ':' || public || ':' || file_size_limit || ':' || coalesce(array_to_string(allowed_mime_types, ' '), '-'),
                     ', ' order by id)
   from storage.buckets where id in ('uploads-quarantine', 'public-media', 'documents')),
  'documents:false:52428800:application/pdf image/jpeg image/png image/webp text/csv '
  || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, '
  || 'public-media:true:52428800:image/webp application/pdf, '
  || 'uploads-quarantine:false:52428800:image/jpeg image/png image/webp application/pdf',
  'three buckets: a private quarantine for raw uploads, the public media and the private documents, each with its types'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage'),
  0,
  'no API role holds a storage policy: every write goes through the server, and finalize alone fills public-media'
);
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('storage.objects'::regclass, 'storage.buckets'::regclass)),
  'and row level security is on for both storage tables, so no policy means no access'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'storage%'
  ),
  array[]::text[],
  'and no storage helper is left behind for a policy that no longer exists'
);

-- ===== anon =====
select pg_temp.act_as('anon');
select is(pg_temp.fixture_count(), 0,
  'anon lists no object, not even in the public bucket: public files are fetched by URL, drafts cannot be browsed');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/anon.webp')$$,
  '42501', null, 'and writes nothing');
select throws_ok($$insert into storage.buckets (id, name, public) values ('anon-bucket', 'anon-bucket', true)$$,
  '42501', null, 'nor creates a bucket');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/none.webp')$$,
  '42501', null, 'a user without a role uploads nothing');

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/baru.webp')$$,
  '42501', null, 'an RW admin writes nothing into public-media, not even under their own prefix: finalize does');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-08/gallery/baru.webp')$$,
  '42501', null, 'nor under RW 08''s');
select is(pg_temp.row_count($$update storage.objects set name = 'rw-05/gallery/pindah.webp'
  where bucket_id = 'public-media' and name = 'rw-05/gallery/fixture-05.webp'$$), 0,
  'nor renames a published file, which would swap a re-encoded image for anything');
select set_config('storage.allow_delete_query', 'true', true);
select is(pg_temp.row_count($$delete from storage.objects where bucket_id = 'public-media'$$), 0,
  'nor deletes one');
select set_config('storage.allow_delete_query', '', true);
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('uploads-quarantine', 'rw-05/00000000-0000-4000-8000-0000000c0a03')$$, '42501', null,
  'the quarantine takes uploads only through a signed URL, never a plain insert');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documents', 'bookings/x/invoice.pdf')$$,
  '42501', null, 'documents are written by the server only');
select is(pg_temp.fixture_count(), 0, 'and an RW admin lists nothing in any bucket');
select is(pg_temp.row_count($$update storage.buckets set public = true where id = 'documents'$$), 0,
  'nor opens the documents bucket to the public');

-- ===== admin_rw 05 without AAL2 =====
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/aal1.webp')$$,
  '42501', null, 'without AAL2 an RW admin uploads nothing either');

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-08/gallery/baru.webp')$$,
  '42501', null, 'RW 08''s admin writes nothing under rw-08/ either');

-- ===== superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'kelurahan/hero/aal1.webp')$$,
  '42501', null, 'the superadmin without AAL2 uploads nothing');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'kelurahan/hero/baru.webp')$$,
  '42501', null, 'and at AAL2 writes nothing under kelurahan/ through the API');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/super.webp')$$,
  '42501', null, 'nor under an RW''s prefix');
select is(pg_temp.fixture_count(), 0, 'and lists nothing in any bucket');
select is(pg_temp.row_count($$update storage.buckets set allowed_mime_types = null where id = 'public-media'$$), 0,
  'nor widens what a bucket accepts');

-- ===== admin_kopdes =====
-- docs/PRD.md §13.1 A30: the Kopdes admin's product photos go through api/uploads/{sign,finalize} like everyone's, and
-- finalize publishes a Kopdes upload as a product photo only (hasUploadAccess, src/server/auth/guards.test.ts); through
-- the API it writes and lists nothing, not even under a product folder.
reset role;
select pg_temp.act_as('admin_kopdes');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('public-media', 'rw-05/products/00000000-0000-4000-8000-0000000c0a04/kopdes.webp')$$, '42501', null,
  'the Kopdes admin writes nothing into public-media, not even a product photo');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('uploads-quarantine', 'rw-08/00000000-0000-4000-8000-0000000c0a05')$$, '42501', null,
  'nor into the quarantine but through a signed URL');
select is(pg_temp.fixture_count(), 0, 'and lists nothing in any bucket');

reset role;
select is(pg_temp.fixture_count(), 5, 'every fixture is still in place');

select * from finish();
rollback;
