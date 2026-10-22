-- Scheduled jobs and their heartbeats (0007_cron, docs/PRD.md §8.9, docs/Security.md §11.3, Task P1.6.01–P1.6.03,
-- security review of PR #5). The Vault secrets and the pg_net answers this suite needs are written and removed
-- inside its own transaction, so pg_net's worker never sees them.
begin;
select plan(53);
\ir helpers/rls_personas.psql

delete from vault.secrets where name in ('environment', 'jobs_base_url', 'cron_secret');
insert into public.site_settings (key, value) values ('booking.max_advance_days', '180')
on conflict (key) do update set value = excluded.value;

-- ===== The schedule =====
select is(
  array(select jobname || ' ' || schedule || ' ' || command from cron.job order by jobname),
  array[
    'anomaly-scan */5 * * * * select internal.call_job(''anomaly-scan'')',
    'check_job_responses */5 * * * * select internal.run_scheduled_job(''check_job_responses'')',
    'close_past_bookings 30 16 * * * select internal.run_scheduled_job(''close_past_bookings'')',
    'enqueue_visit_reminders 0 2 * * * select internal.run_scheduled_job(''enqueue_visit_reminders'')',
    'expire_stale_bookings */5 * * * * select internal.run_scheduled_job(''expire_stale_bookings'')',
    'generate_visit_sessions 0 17 * * * select internal.run_scheduled_job(''generate_visit_sessions'')',
    'payments-poll */5 * * * * select internal.call_job(''payments-poll'')',
    'process-notifications * * * * * select internal.call_job(''process-notifications'')',
    'prune_operational_tables 0 18 1 * * select internal.run_scheduled_job(''prune_operational_tables'')',
    'prune_rate_limit_buckets 15 * * * * select internal.run_scheduled_job(''prune_rate_limit_buckets'')',
    'purge-storage 15 * * * * select internal.call_job(''purge-storage'')',
    'purge/retention 0 19 * * * select internal.run_scheduled_job(''purge/retention'')',
    'reconcile-payments 30 19 * * * select internal.call_job(''reconcile-payments'')'
  ],
  'cron.job holds exactly the thirteen jobs of docs/PRD.md §8.9, in UTC, each a single call without dynamic SQL'
);
select is(
  (select count(*)::int from cron.job where username <> 'postgres' or not active or database <> current_database()),
  0,
  'every job is active and runs as postgres in this database'
);
select is(
  array(select job || ' ' || kind || ' ' || max_age from public.job_heartbeats order by job),
  array[
    'anomaly-scan application 00:15:00', 'check_job_responses database 00:15:00',
    'close_past_bookings database 26:00:00', 'enqueue_visit_reminders database 26:00:00',
    'expire_stale_bookings database 00:15:00', 'generate_visit_sessions database 26:00:00',
    'payments-poll application 00:15:00', 'process-notifications application 00:15:00',
    'prune_operational_tables database 32 days', 'prune_rate_limit_buckets database 02:00:00',
    'purge-storage application 02:00:00', 'purge/retention database 26:00:00',
    'reconcile-payments application 26:00:00'
  ],
  'every scheduled job has a heartbeat with how long it may go without a success'
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

-- A marker outside the allow-list counts as hosted too.
select vault.create_secret('prod', 'environment');
select is(internal.call_job('reconcile-payments'), null::bigint, 'a database marked prod sends nothing');
select is(
  (select last_error_code from public.job_heartbeats where job = 'reconcile-payments' and last_failure_at = now()),
  'secret_missing',
  'and records the failure, because prod is not a value it knows'
);

-- Marked local: the same missing secrets are quiet.
select vault.update_secret((select id from vault.secrets where name = 'environment'), 'local');
select is(internal.call_job('anomaly-scan'), null::bigint, 'a local database without secrets sends nothing either');
select is(
  (select count(*)::int from public.job_heartbeats where job = 'anomaly-scan' and last_failure_at = now())
  + (select count(*)::int from public.security_events
     where event_type = 'cron_failed' and entity_id = 'anomaly-scan' and occurred_at = now()),
  0,
  'but records no failure, so a developer''s database stays quiet'
);

-- The bearer travels over HTTPS only, except to a developer's own machine.
select vault.create_secret('http://host.docker.internal:3000', 'jobs_base_url');
select vault.create_secret('rahasia-cron-uji', 'cron_secret');
select ok(internal.call_job('anomaly-scan') is not null, 'a local database may call its routes over plain HTTP');
select vault.update_secret((select id from vault.secrets where name = 'environment'), 'production');
select is(internal.call_job('payments-poll'), null::bigint, 'a hosted one never sends the CRON_SECRET over plain HTTP');
select is(
  (select last_error_code from public.job_heartbeats where job = 'payments-poll' and last_failure_at = now()),
  'insecure_base_url',
  'and records why'
);
select is(
  (select count(*)::int from net.http_request_queue where url like 'http://host.docker.internal:3000/api/jobs/payments-poll%'),
  0,
  'with no request queued'
);

-- With HTTPS secrets, a job is one authenticated request to its route, followed by its heartbeat.
select vault.update_secret((select id from vault.secrets where name = 'jobs_base_url'), 'https://gisikdrono.example.test/');
select ok(internal.call_job('process-notifications') is not null, 'with the secrets an application job is queued');
select is(
  (select method || ' ' || url || ' ' || (headers ->> 'Authorization') from net.http_request_queue
   where url like 'https://gisikdrono.example.test/api/jobs/process-notifications%' order by id desc limit 1),
  'POST https://gisikdrono.example.test/api/jobs/process-notifications Bearer rahasia-cron-uji',
  'the outbox worker is a POST with the CRON_SECRET bearer'
);
select is(
  (select last_request_id from public.job_heartbeats where job = 'process-notifications'),
  (select max(id) from net.http_request_queue where url like '%/api/jobs/process-notifications'),
  'and the heartbeat follows that request'
);
select ok(internal.call_job('purge-storage') is not null, 'the storage purge is queued too');
select is(
  (select method || ' ' || url from net.http_request_queue
   where url like 'https://gisikdrono.example.test/api/jobs/purge-storage%' order by id desc limit 1),
  'POST https://gisikdrono.example.test/api/jobs/purge-storage',
  'as a POST to its own route: every job changes something, so none is a GET (independent review of PR #26)'
);

-- ===== Answers from the routes (net._http_response) =====
create function pg_temp.answer(p_job text, p_status integer, p_timed_out boolean, p_error text) returns void
  language sql
as $$
  insert into net._http_response (id, status_code, timed_out, error_msg, created)
  select h.last_request_id, p_status, p_timed_out, p_error, now() from public.job_heartbeats h where h.job = p_job;
$$;

select pg_temp.answer('process-notifications', 500, false, null);
select lives_ok($$select internal.run_scheduled_job('check_job_responses')$$, 'the response check runs');
select is(
  (select last_error_code || ' ' || (last_request_id is null) from public.job_heartbeats
   where job = 'process-notifications' and last_failure_at = now()),
  'http_500 true',
  'a route that answered 500 is a failed run, and its request is settled'
);
select is(
  (select count(*)::int from public.security_events
   where event_type = 'cron_failed' and entity_id = 'process-notifications' and details ->> 'error_code' = 'http_500'
     and occurred_at = now()),
  1,
  'with its cron_failed security event'
);
select ok(
  (select last_success_at = now() from public.job_heartbeats where job = 'check_job_responses'),
  'and the check leaves its own heartbeat'
);

select pg_temp.answer('purge-storage', null, true, 'Timeout of 60000 ms reached');
select internal.check_job_responses();
select is((select last_error_code from public.job_heartbeats where job = 'purge-storage' and last_failure_at = now()),
  'timeout', 'a request that timed out is a failed run');

select internal.call_job('payments-poll');
select pg_temp.answer('payments-poll', 200, false, null);
update public.job_heartbeats set last_failure_at = null where job = 'payments-poll';
select internal.check_job_responses();
select is(
  (select (last_failure_at is null) || ' ' || (last_request_id is null) from public.job_heartbeats
   where job = 'payments-poll'),
  'true true',
  'an answer of 200 records nothing here: the route reports its own outcome'
);

update public.job_heartbeats set last_failure_at = null, last_error_code = null where job = 'reconcile-payments';
select internal.call_job('reconcile-payments');
select internal.check_job_responses();
select is(
  (select (last_request_id is not null) || ' ' || (last_failure_at is null) from public.job_heartbeats
   where job = 'reconcile-payments'),
  'true true',
  'a request still unanswered after a few minutes is left pending'
);
select ok(
  (select count(*) = 0 from public.security_events
   where event_type = 'cron_failed' and entity_id = 'reconcile-payments' and details ->> 'error_code' = 'no_response'),
  'without a failure yet'
);
update public.job_heartbeats set last_requested_at = now() - interval '16 minutes' where job = 'reconcile-payments';
select internal.check_job_responses();
select is(
  (select count(*)::int from public.security_events
   where event_type = 'cron_failed' and entity_id = 'reconcile-payments' and details ->> 'error_code' = 'no_response'
     and occurred_at = now()),
  1,
  'but one that never answered within fifteen minutes is a failed run'
);

select internal.call_job('anomaly-scan');
update public.job_heartbeats set last_requested_at = now() - interval '1 minute' where job = 'anomaly-scan';
select public.svc_record_job_run('anomaly-scan', false, 'run_failed');
select pg_temp.answer('anomaly-scan', 503, false, null);
select internal.check_job_responses();
select is(
  (select count(*)::int from public.security_events
   where event_type = 'cron_failed' and entity_id = 'anomaly-scan' and occurred_at = now()),
  1,
  'a route that reported its own failure is not counted twice for the 503 it answered'
);

-- ===== Database jobs =====
select throws_ok($$select internal.run_scheduled_job('drop-everything')$$, '22023', null,
  'run_scheduled_job knows its own jobs only');
select throws_ok($$select internal.run_scheduled_job('payments-poll')$$, '22023', null,
  'and never runs an application job');

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
    where p.proname in ('svc_record_job_run', 'svc_job_health', 'call_job', 'run_scheduled_job', 'record_job_run',
                        'settle_job_response', 'check_job_responses')
      and has_function_privilege(r.role_name, p.oid, 'execute')
    order by 1
  ),
  array['svc_job_health:service_role', 'svc_record_job_run:service_role'],
  'only the service role reports a run or reads the heartbeats, through the svc wrappers'
);
select public.svc_record_job_run('payments-poll', true);
select is(
  (select last_success_at = now() and last_error_code = 'insecure_base_url' from public.svc_job_health()
   where job = 'payments-poll'),
  true,
  'a route reports its success, and the last failure stays visible beside it'
);
select throws_ok($$select public.svc_record_job_run('expire_stale_bookings', true)$$, '22023', null,
  'a route cannot report for a database job, so it cannot hide one that stopped');

set local role service_role;
select throws_ok($$update public.job_heartbeats set last_success_at = now() where job = 'expire_stale_bookings'$$,
  '42501', null, 'nor can the service role write a heartbeat directly');
reset role;

-- ===== Health =====
update public.job_heartbeats set last_success_at = null, watching_since = now() - interval '33 days'
where job = 'prune_operational_tables';
update public.job_heartbeats set last_success_at = now() - interval '20 minutes' where job = 'payments-poll';
update public.job_heartbeats set last_success_at = null, watching_since = now() where job = 'purge-storage';
select is(
  (select string_agg(job || '=' || is_stalled, ' ' order by job) from public.svc_job_health()
   where job in ('payments-poll', 'prune_operational_tables', 'purge-storage')),
  'payments-poll=true prune_operational_tables=true purge-storage=false',
  'a job that went longer than its limit without a success is stalled, so /api/health answers 503; one still inside its first period is not'
);
select vault.update_secret((select id from vault.secrets where name = 'environment'), 'local');
select is(
  (select string_agg(job || '=' || is_stalled, ' ' order by job) from public.svc_job_health()
   where job in ('payments-poll', 'prune_operational_tables')),
  'payments-poll=false prune_operational_tables=true',
  'on a local database only the application jobs are never stalled'
);

-- ===== Who sees the heartbeats and the job machinery =====
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
reset role;

select is(
  array(
    select r.role_name || ':' || s.schema_name
    from (values ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('cron'), ('vault'), ('internal')) as s(schema_name)
    where has_schema_privilege(r.role_name, s.schema_name, 'usage')
    order by 1
  ),
  array[]::text[],
  'no API role may use the cron, vault or internal schema'
);
select is(
  (select count(*)::int from pg_publication_tables
   where schemaname in ('net', 'vault', 'cron', 'internal', 'auth', 'storage')),
  0,
  'and Realtime broadcasts nothing from pg_net''s queue, Vault, cron, Auth or Storage'
);

select * from finish();
rollback;
