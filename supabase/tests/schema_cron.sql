-- Scheduled jobs and their heartbeats (0007_cron, docs/PRD.md §8.9, docs/Security.md §11.3, Task P1.6.01–P1.6.03).
-- The Vault secrets this suite needs are written and removed inside its own transaction.
begin;
select plan(28);
\ir helpers/rls_personas.psql

delete from vault.secrets where name in ('environment', 'jobs_base_url', 'cron_secret');
insert into public.site_settings (key, value) values ('booking.max_advance_days', '180')
on conflict (key) do update set value = excluded.value;

-- ===== The schedule =====
select is(
  array(select jobname || ' ' || schedule || ' ' || command from cron.job order by jobname),
  array[
    'anomaly-scan */5 * * * * select internal.call_job(''anomaly-scan'')',
    'close_past_bookings 30 16 * * * select internal.run_scheduled_job(''close_past_bookings'')',
    'enqueue_visit_reminders 0 2 * * * select internal.run_scheduled_job(''enqueue_visit_reminders'')',
    'expire_stale_bookings */5 * * * * select internal.run_scheduled_job(''expire_stale_bookings'')',
    'generate_visit_sessions 0 17 * * * select internal.run_scheduled_job(''generate_visit_sessions'')',
    'payments-poll */5 * * * * select internal.call_job(''payments-poll'')',
    'process-notifications * * * * * select internal.call_job(''process-notifications'')',
    'prune_operational_tables 0 18 1 * * select internal.run_scheduled_job(''prune_operational_tables'')',
    'prune_rate_limit_buckets 15 * * * * select internal.run_scheduled_job(''prune_rate_limit_buckets'')',
    'purge-storage 15 19 * * * select internal.call_job(''purge-storage'')',
    'purge/retention 0 19 * * * select internal.run_scheduled_job(''purge/retention'')',
    'reconcile-payments 30 19 * * * select internal.call_job(''reconcile-payments'')'
  ],
  'cron.job holds exactly the twelve jobs of docs/PRD.md §8.9, in UTC, each a single call without dynamic SQL'
);
select is(
  (select count(*)::int from cron.job where username <> 'postgres' or not active or database <> current_database()),
  0,
  'every job is active and runs as postgres in this database'
);

-- ===== Application jobs =====
select throws_ok($$select internal.call_job('drop-everything')$$, '22023', null, 'call_job knows its five routes only');

-- No secrets and no environment marker: a hosted database that was never configured fails loudly.
select is(internal.call_job('payments-poll'), null::bigint, 'without its Vault secrets an application job sends nothing');
select is(
  (select last_error_code from public.job_heartbeats where job = 'payments-poll' and last_failure_at = now()),
  'secret_missing',
  'on a database not marked local, that is a failed run'
);
select is(
  (select count(*)::int from public.security_events
   where event_type = 'cron_failed' and entity_id = 'payments-poll' and details ->> 'error_code' = 'secret_missing'
     and occurred_at = now()),
  1,
  'and a cron_failed security event'
);

-- Marked local: the same missing secrets are quiet.
select vault.create_secret('local', 'environment');
select is(internal.call_job('anomaly-scan'), null::bigint, 'a local database without secrets sends nothing either');
select is(
  (select count(*)::int from public.job_heartbeats where job = 'anomaly-scan' and last_failure_at = now())
  + (select count(*)::int from public.security_events
     where event_type = 'cron_failed' and entity_id = 'anomaly-scan' and occurred_at = now()),
  0,
  'but records no failure, so a developer''s database stays quiet'
);

-- With the secrets, a job is one authenticated request to its route.
select vault.create_secret('https://gisikdrono.example.test/', 'jobs_base_url');
select vault.create_secret('rahasia-cron-uji', 'cron_secret');
select ok(internal.call_job('process-notifications') is not null, 'with the secrets an application job is queued');
select is(
  (select method || ' ' || url || ' ' || (headers ->> 'Authorization') from net.http_request_queue
   where url like 'https://gisikdrono.example.test/api/jobs/process-notifications%' order by id desc limit 1),
  'POST https://gisikdrono.example.test/api/jobs/process-notifications Bearer rahasia-cron-uji',
  'the outbox worker is a POST with the CRON_SECRET bearer'
);
select ok(internal.call_job('purge-storage') is not null, 'and so is the storage purge');
select is(
  (select method || ' ' || url from net.http_request_queue
   where url like 'https://gisikdrono.example.test/api/jobs/purge-storage%' order by id desc limit 1),
  'GET https://gisikdrono.example.test/api/jobs/purge-storage',
  'as a GET to its own route'
);

-- ===== Database jobs =====
select throws_ok($$select internal.run_scheduled_job('drop-everything')$$, '22023', null,
  'run_scheduled_job knows its seven jobs only');

select lives_ok($$select internal.run_scheduled_job('expire_stale_bookings')$$, 'a database job runs');
select ok(
  (select last_success_at = now() from public.job_heartbeats where job = 'expire_stale_bookings'),
  'and leaves its heartbeat'
);

insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
select 5, d, 'Uji Cron', '06:10', '07:10', 20 from generate_series(0, 6) d;
select lives_ok($$select internal.run_scheduled_job('generate_visit_sessions')$$, 'the nightly session generator runs');
select ok(
  (select count(*) from public.visit_sessions where rw_id = 5 and label = 'Uji Cron' and start_time = '06:10') >= 180,
  'and plans each active RW''s sessions as far ahead as booking.max_advance_days'
);
select throws_ok($$delete from public.site_settings where key = 'booking.max_advance_days'$$, 'P0001',
  'site setting booking.max_advance_days is required and cannot be removed',
  'which is why that setting cannot be removed now');

-- A failing job is rolled back, recorded and left for its next run instead of raising.
alter table public.site_settings disable trigger site_settings_required_keys;
delete from public.site_settings where key = 'pii_retention_months';
alter table public.site_settings enable trigger site_settings_required_keys;
select lives_ok($$select internal.run_scheduled_job('purge/retention')$$, 'a failing job does not raise');
select is(
  (select last_error_code from public.job_heartbeats
   where job = 'purge/retention' and last_failure_at = now() and last_success_at is distinct from now()),
  '55000',
  'it records the failure with its SQLSTATE and no success'
);
select is(
  (select count(*)::int from public.security_events
   where event_type = 'cron_failed' and entity_id = 'purge/retention' and occurred_at = now()),
  1,
  'and raises a cron_failed security event'
);

-- ===== Reporting and reading heartbeats =====
select is(
  array(
    select p.proname || ':' || r.role_name from pg_proc p
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
    where p.proname in ('svc_record_job_run', 'svc_job_health', 'call_job', 'run_scheduled_job', 'record_job_run')
      and has_function_privilege(r.role_name, p.oid, 'execute')
    order by 1
  ),
  array['svc_job_health:service_role', 'svc_record_job_run:service_role'],
  'only the service role reports a run or reads the heartbeats, through the svc wrappers'
);
select public.svc_record_job_run('payments-poll', true);
select is(
  (select last_success_at = now() and last_error_code = 'secret_missing' from public.svc_job_health()
   where job = 'payments-poll'),
  true,
  'a route reports its success, and the last failure stays visible beside it'
);

select pg_temp.act_as('anon');
select throws_ok($$select job from public.job_heartbeats$$, '42501', null, 'anon reads no heartbeat');
reset role;
select pg_temp.act_as('admin_rw_05');
select is((select count(*)::int from public.job_heartbeats), 0, 'an RW admin sees none');
reset role;
select pg_temp.act_as('superadmin_aal1');
select is((select count(*)::int from public.job_heartbeats), 0, 'nor does the superadmin without AAL2');
reset role;
select pg_temp.act_as('superadmin_aal2');
select ok((select count(*) from public.job_heartbeats where job = 'payments-poll') = 1, 'the superadmin at AAL2 reads them');
select throws_ok($$update public.job_heartbeats set last_success_at = now() where job = 'payments-poll'$$, '42501', null,
  'but writes none: only the jobs and their routes report');

select * from finish();
rollback;
