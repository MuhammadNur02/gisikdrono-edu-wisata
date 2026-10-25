-- Independent review of PR #63, Mediums 1 and 3 (docs/Security.md §7.5; 20261031080000_export_failures.sql): the
-- documents bucket takes a 50 MB export; svc_fail_export marks an export whose file was never stored as failed,
-- gives its hit on the hourly cap back and audits the failure, once, for the requester's own undelivered export only,
-- and only for the service role; the hourly purge-storage run takes an expired export's file whether or not a
-- retention run has marked it.
begin;
select plan(16);
\ir helpers/rls_personas.psql

-- A period in which nothing happens: the exports below hold no row.
create function pg_temp.empty_period() returns jsonb
  language sql stable
as $$ select jsonb_build_object('from', public.today_jkt() + 300, 'to', public.today_jkt() + 301); $$;
create temporary table answers (name text primary key, answer jsonb) on commit drop;
grant insert, select on answers to authenticated;
grant execute on function pg_temp.empty_period() to authenticated;
create function pg_temp.export_id(p_name text) returns uuid
  language sql stable
as $$ select (answer ->> 'export_id')::uuid from answers where name = p_name; $$;
create function pg_temp.hits() returns integer
  language sql stable
as $$
  select coalesce(sum(b.count), 0)::integer from public.rate_limit_buckets b
  where b.key = 'export:user:' || pg_temp.persona_id('superadmin_aal2');
$$;

-- ===== The bucket =====
select is((select file_size_limit from storage.buckets where id = 'documents'), 50::bigint * 1024 * 1024,
  'the documents bucket takes a 50 MB export');

-- ===== svc_fail_export =====
select ok(has_function_privilege('service_role', 'public.svc_fail_export(uuid, uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_fail_export(uuid, uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.svc_fail_export(uuid, uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'internal.fail_export(uuid, uuid, text)', 'execute'),
  'only the service role fails an export, so no staff member can refund their own cap');

select pg_temp.act_as('superadmin_aal2');
insert into answers values
  ('big', public.rpc_create_export('visits', 'csv', pg_temp.empty_period(), 'Rekap kunjungan untuk uji gagal')),
  ('stored', public.rpc_create_export('visits', 'csv', pg_temp.empty_period(), 'Rekap kunjungan untuk uji simpan'));
reset role;
select is(pg_temp.hits(), 2, 'two exports count twice on the hourly cap');

select ok(public.svc_fail_export(pg_temp.export_id('big'), pg_temp.persona_id('superadmin_aal2'), 'too_large'),
  'a file too big to store fails its export');
select is((select (e.failed_at is not null, e.failure_reason, e.deleted_at is not null, e.storage_path)::text
           from public.exports e where e.id = pg_temp.export_id('big')),
  (true, 'too_large', true, null::text)::text,
  'the row is marked failed, with nothing to purge');
select is(pg_temp.hits(), 1, 'and its hit on the hourly cap is given back');
select is((select (a.actor_id, a.actor_role, a.metadata ->> 'reason', a.metadata ->> 'kind')::text
           from public.audit_logs a
           where a.action = 'export.failed' and a.entity_id = pg_temp.export_id('big')::text),
  (pg_temp.persona_id('superadmin_aal2'), 'superadmin', 'too_large', 'visits')::text,
  'the audit trail records the failure in the requester''s name');

select ok(not public.svc_fail_export(pg_temp.export_id('big'), pg_temp.persona_id('superadmin_aal2'), 'too_large'),
  'a replay changes nothing');
select is(pg_temp.hits(), 1, 'and gives nothing back twice');
select ok(not public.svc_fail_export(pg_temp.export_id('stored'), pg_temp.persona_id('admin_rw_05'), 'upload_failed'),
  'another staff member''s export is not theirs to fail');

update public.exports set storage_path = 'exports/' || pg_temp.persona_id('superadmin_aal2') || '/uji-simpan.csv'
where id = pg_temp.export_id('stored');
select ok(not public.svc_fail_export(pg_temp.export_id('stored'), pg_temp.persona_id('superadmin_aal2'),
                                     'record_failed'),
  'nor is an export whose file is stored');
select is(pg_temp.hits(), 1, 'whose hit stays counted');
select throws_ok($$select public.svc_fail_export(pg_temp.export_id('stored'), pg_temp.persona_id('superadmin_aal2'),
                                                 'bosan')$$,
  '22023', null, 'a failure names one of its four reasons');

-- ===== Expired files go in the hourly run =====
insert into public.exports (id, kind, format, requested_by, filters, reason, row_count, storage_path, watermark,
                            expires_at, created_at) values
  ('00000000-0000-4000-8000-0000000e0f01', 'visits', 'csv', pg_temp.persona_id('superadmin_aal2'), '{}',
   'Rekap lama yang sudah kedaluwarsa', 1, 'exports/uji-kedaluwarsa/lama.csv', 'Diekspor oleh Super RLS',
   now() - interval '1 hour', now() - interval '25 hours'),
  ('00000000-0000-4000-8000-0000000e0f02', 'visits', 'csv', pg_temp.persona_id('superadmin_aal2'), '{}',
   'Rekap baru yang masih berlaku', 1, 'exports/uji-kedaluwarsa/baru.csv', 'Diekspor oleh Super RLS',
   now() + interval '23 hours', now() - interval '1 hour');
select is((select string_agg(f.path, ' ' order by f.path) from public.svc_purgeable_files(1000) as f
           where f.path like 'exports/uji-kedaluwarsa/%'),
  'exports/uji-kedaluwarsa/lama.csv',
  'an export past its 24 hours is purgeable before any retention run marks it, a live one is not');
select is(public.svc_forget_purged_files(array['exports/uji-kedaluwarsa/lama.csv',
                                               'exports/uji-kedaluwarsa/baru.csv']), 1,
  'forgetting the deleted files clears the expired one only');
select is((select string_agg(right(e.id::text, 2) || '=' || (e.storage_path is null) || '/' || (e.deleted_at is not null),
                             ' ' order by e.id)
           from public.exports e where e.id::text like '00000000-0000-4000-8000-0000000e0f0%'),
  '01=true/true 02=false/false',
  'which is marked deleted with its path gone, while the live export keeps both');

select * from finish();
rollback;
