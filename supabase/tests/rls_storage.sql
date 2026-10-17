-- Storage buckets and storage.objects policies (docs/PRD.md §8.8, docs/Security.md §6.8, UPL-03, UPL-04, Task
-- P1.5.01, P1.5.02). Every check runs as an API role. The Storage API itself sets storage.allow_delete_query
-- before it deletes a row, so the delete checks set it too and test the policies, not Supabase's own guard.
begin;
select plan(24);
\ir helpers/rls_personas.psql

insert into storage.objects (bucket_id, name) values
  ('public-media', 'rw-05/gallery/fixture-05.webp'),
  ('public-media', 'rw-08/gallery/fixture-08.webp'),
  ('public-media', 'kelurahan/hero/fixture-kel.webp'),
  ('uploads-quarantine', 'rw-05/00000000-0000-4000-8000-0000000c0a01'),
  ('documents', 'bookings/00000000-0000-4000-8000-0000000c0a02/ticket.pdf');
create function pg_temp.fixture_count(p_bucket text) returns integer
  language sql stable
as $$
  select count(*)::int from storage.objects
  where bucket_id = p_bucket
    and name in ('rw-05/gallery/fixture-05.webp', 'rw-08/gallery/fixture-08.webp', 'kelurahan/hero/fixture-kel.webp',
                 'rw-05/00000000-0000-4000-8000-0000000c0a01', 'bookings/00000000-0000-4000-8000-0000000c0a02/ticket.pdf');
$$;
grant execute on function pg_temp.fixture_count(text) to anon, authenticated;

-- ===== Buckets =====
select is(
  (select string_agg(id || ':' || public || ':' || file_size_limit || ':' || coalesce(array_to_string(allowed_mime_types, ' '), '-'),
                     ', ' order by id)
   from storage.buckets where id in ('uploads-quarantine', 'public-media', 'documents')),
  'documents:false:20971520:-, public-media:true:52428800:image/webp application/pdf, '
  || 'uploads-quarantine:false:52428800:image/jpeg image/png image/webp application/pdf',
  'three buckets: a private quarantine for raw uploads, the public media and the private documents'
);
select is(
  (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'storage'),
  'public_media_delete, public_media_insert, public_media_read, public_media_update',
  'storage policies exist for public-media only: the quarantine and the documents have none for any API role'
);

-- ===== anon =====
select pg_temp.act_as('anon');
select is(pg_temp.fixture_count('public-media'), 3, 'anon reads the public media');
select is(pg_temp.fixture_count('uploads-quarantine') + pg_temp.fixture_count('documents'), 0,
  'but nothing in the quarantine or the documents');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/anon.webp')$$,
  '42501', null, 'and writes nothing');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/none.webp')$$,
  '42501', null, 'a user without a role uploads nothing');

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/baru.webp')$$,
  'an RW admin writes under their own RW''s prefix');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-08/gallery/baru.webp')$$,
  '42501', null, 'never under RW 08''s');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'kelurahan/hero/baru.webp')$$,
  '42501', null, 'nor under the kelurahan''s');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'gallery/tanpa-prefix.webp')$$,
  '42501', null, 'nor without a prefix');
select throws_ok($$update storage.objects set name = 'rw-08/gallery/pindah.webp'
  where bucket_id = 'public-media' and name = 'rw-05/gallery/fixture-05.webp'$$, '42501', null,
  'nor moves their own object into RW 08''s prefix');
select is(pg_temp.row_count($$update storage.objects set metadata = '{"alt": "baru"}'
  where bucket_id = 'public-media' and name = 'rw-08/gallery/fixture-08.webp'$$), 0, 'and changes nothing of RW 08''s');
select set_config('storage.allow_delete_query', 'true', true);
select is(pg_temp.row_count($$delete from storage.objects
  where bucket_id = 'public-media' and name = 'rw-08/gallery/fixture-08.webp'$$), 0, 'nor deletes it');
select is(pg_temp.row_count($$delete from storage.objects
  where bucket_id = 'public-media' and name = 'rw-05/gallery/baru.webp'$$), 1, 'but deletes their own');
select set_config('storage.allow_delete_query', '', true);
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('uploads-quarantine', 'rw-05/00000000-0000-4000-8000-0000000c0a03')$$, '42501', null,
  'the quarantine takes uploads only through a signed URL, never a plain insert');
select is(pg_temp.fixture_count('uploads-quarantine'), 0, 'and shows them nothing');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documents', 'bookings/x/invoice.pdf')$$,
  '42501', null, 'documents are written by the server only');
select is(pg_temp.fixture_count('documents'), 0, 'and read only through signed URLs');

-- ===== admin_rw 05 without AAL2 =====
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/aal1.webp')$$,
  '42501', null, 'without AAL2 an RW admin uploads nothing, not even under their own prefix');

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-08/gallery/baru.webp')$$,
  'RW 08''s admin writes under rw-08/');

-- ===== superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'kelurahan/hero/aal1.webp')$$,
  '42501', null, 'without AAL2 the superadmin uploads nothing either');
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'kelurahan/hero/baru.webp')$$,
  'the superadmin writes under kelurahan/');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('public-media', 'rw-05/gallery/super.webp')$$,
  'and under any RW''s prefix');
select is(pg_temp.fixture_count('documents') + pg_temp.fixture_count('uploads-quarantine'), 0,
  'but reads no document or quarantined upload through the API either');

select * from finish();
rollback;
