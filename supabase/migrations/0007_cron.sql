-- 0007_cron: the scheduled jobs and their heartbeats (docs/PRD.md §8.9, docs/Security.md §11.3, Task P1.6.01,
-- P1.6.02, P1.6.03; decisions of 2026-10-17).
--
-- pg_cron runs every job as postgres. A job that works in the database runs through run_scheduled_job, which
-- calls its function by name from a fixed list, so no schedule carries dynamic SQL. A job that needs the
-- application (the outbox worker, Midtrans polling, reconciliation, the anomaly scan, Storage deletes) runs
-- through call_job, which posts to its /api/jobs route with the CRON_SECRET bearer from Vault.
--
-- Every run leaves a heartbeat: a database job when it returns, an application job when its route finishes
-- (svc_record_job_run). /api/health (Task P3.11.07) answers 503 when a watched job has not succeeded for 15
-- minutes, so the outbox or payment polling cannot die quietly. A failed run, and an application job whose
-- Vault secrets are missing, is a cron_failed security event; only a database marked local (Vault secret
-- environment = 'local', written by supabase/seed.sql) skips application jobs quietly when it has no secrets,
-- and a database without the marker counts as hosted.


-- ===== Heartbeats =====

create table public.job_heartbeats (
  job             text primary key check (job in (
                    'expire_stale_bookings', 'process-notifications', 'payments-poll', 'anomaly-scan',
                    'enqueue_visit_reminders', 'close_past_bookings', 'generate_visit_sessions', 'reconcile-payments',
                    'purge/retention', 'purge-storage', 'prune_rate_limit_buckets', 'prune_operational_tables')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text check (length(last_error_code) <= 64),
  updated_at      timestamptz not null default now()
);
alter table public.job_heartbeats enable row level security;
alter table public.job_heartbeats force row level security;
revoke all on public.job_heartbeats from anon, authenticated;
create trigger set_updated_at before update on public.job_heartbeats
  for each row execute function public.set_updated_at();

-- The superadmin may look at the jobs; only the functions below write them.
grant select (job, last_success_at, last_failure_at, last_error_code, updated_at) on public.job_heartbeats
  to authenticated;
create policy job_heartbeats_super_read on public.job_heartbeats for select to authenticated
  using ((select public.is_superadmin()));
create policy job_heartbeats_aal2 on public.job_heartbeats as restrictive for all to authenticated
  using ((select public.aal2()));

-- A success moves last_success_at; a failure moves last_failure_at with its code and is also a cron_failed
-- security event, which the anomaly scan and the out-of-band alerts pick up.
create function internal.record_job_run(p_job text, p_succeeded boolean, p_error_code text default null)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  insert into public.job_heartbeats as heartbeat (job, last_success_at, last_failure_at, last_error_code)
  values (p_job, case when p_succeeded then now() end, case when not p_succeeded then now() end,
          case when not p_succeeded then p_error_code end)
  on conflict (job) do update
  set last_success_at = coalesce(excluded.last_success_at, heartbeat.last_success_at),
      last_failure_at = coalesce(excluded.last_failure_at, heartbeat.last_failure_at),
      last_error_code = case when p_succeeded then heartbeat.last_error_code else excluded.last_error_code end;

  if not p_succeeded then
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('cron_failed', 'high', 'job', p_job, jsonb_build_object('job', p_job, 'error_code', p_error_code));
  end if;
end;
$$;


-- ===== Jobs that call the application (Task P1.6.02) =====

-- The environment this database belongs to, from the Vault secret environment: 'local' (supabase/seed.sql),
-- 'staging' or 'production' (Task P0.3.03). NULL means nobody set it, which counts as hosted.
create function internal.environment() returns text
  language sql stable security definer
  set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'environment';
$$;

-- Posts one application job to its route. The base URL and the bearer come from Vault (jobs_base_url,
-- cron_secret), set per environment like the other secrets of Task P0.3.03. Returns the pg_net request id, or
-- NULL when the secrets are missing: quietly on a local database, as a failed run everywhere else.
create function internal.call_job(p_job text) returns bigint
  language plpgsql security definer
  set search_path = ''
as $$
declare
  route_timeout_ms constant integer := 60000;   -- the job routes' maxDuration
  path text := case p_job
    when 'process-notifications' then '/api/jobs/process-notifications'
    when 'payments-poll' then '/api/jobs/payments-poll'
    when 'anomaly-scan' then '/api/jobs/anomaly-scan'
    when 'reconcile-payments' then '/api/jobs/reconcile-payments'
    when 'purge-storage' then '/api/jobs/purge-storage'
  end;
  base_url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jobs_base_url');
  cron_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'cron_secret');
begin
  if path is null then
    raise exception 'no application job is called %', p_job using errcode = '22023';
  end if;
  if base_url is null or cron_secret is null then
    if internal.environment() is distinct from 'local' then
      perform internal.record_job_run(p_job, false, 'secret_missing');
    end if;
    return null;
  end if;

  -- process-notifications is a POST because it claims and changes outbox rows; the others read first.
  if p_job = 'process-notifications' then
    return net.http_post(url := rtrim(base_url, '/') || path, body := '{}'::jsonb,
                         headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret,
                                                       'Content-Type', 'application/json'),
                         timeout_milliseconds := route_timeout_ms);
  end if;
  return net.http_get(url := rtrim(base_url, '/') || path,
                      headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
                      timeout_milliseconds := route_timeout_ms);
end;
$$;

-- The application jobs report back when their route has finished (Task P3.11.07 and the job routes).
create function public.svc_record_job_run(p_job text, p_succeeded boolean, p_error_code text default null)
  returns void
  language sql security definer
  set search_path = ''
as $$ select internal.record_job_run(p_job, p_succeeded, p_error_code); $$;

-- What /api/health reads: every job's last success and failure.
create function public.svc_job_health() returns setof public.job_heartbeats
  language sql stable security definer
  set search_path = ''
as $$ select * from public.job_heartbeats order by job; $$;


-- ===== Jobs inside the database (Task P1.6.01) =====

-- generate_visit_sessions now reads booking.max_advance_days every night, so that setting joins the ones that
-- cannot be removed. This replaces the 0005 version of site_settings_required_keys.
create or replace function internal.site_settings_required_keys() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  required_keys constant text[] := array['pricing.min_price_per_pax', 'booking.quotation_valid_days',
                                         'pii_retention_months', 'booking.max_advance_days'];
begin
  if tg_op <> 'INSERT' and old.key = any (required_keys) and (tg_op = 'DELETE' or new.key <> old.key) then
    raise exception 'site setting % is required and cannot be removed', old.key
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if tg_op <> 'DELETE' and new.key = any (required_keys) and jsonb_typeof(new.value) <> 'number' then
    raise exception 'site setting % must be a number', new.key using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

-- Runs one database job and records its heartbeat. A job that fails is rolled back to the start of the run,
-- recorded as a failure, and the next schedule tries again.
create function internal.run_scheduled_job(p_job text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  advance_days integer;
begin
  if p_job not in ('expire_stale_bookings', 'enqueue_visit_reminders', 'close_past_bookings', 'generate_visit_sessions',
                   'purge/retention', 'prune_rate_limit_buckets', 'prune_operational_tables') then
    raise exception 'no database job is called %', p_job using errcode = '22023';
  end if;

  begin
    case p_job
      when 'expire_stale_bookings' then
        perform internal.expire_stale_bookings();
      when 'enqueue_visit_reminders' then
        perform internal.enqueue_visit_reminders();
      when 'close_past_bookings' then
        perform internal.close_past_bookings();
        perform internal.reconcile_session_counters();
      when 'generate_visit_sessions' then
        advance_days := (select (value #>> '{}')::integer from public.site_settings
                         where key = 'booking.max_advance_days');
        if advance_days is null then
          raise exception 'site setting booking.max_advance_days is missing'
            using errcode = 'object_not_in_prerequisite_state';
        end if;
        perform public.generate_visit_sessions(r.id, public.today_jkt(), public.today_jkt() + advance_days)
        from public.rw_units r where r.is_active;
      when 'purge/retention' then
        perform internal.purge_participants();
        perform internal.anonymise_booker_pii();
      when 'prune_rate_limit_buckets' then
        delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
      when 'prune_operational_tables' then
        perform internal.prune_operational_tables();
    end case;
    perform internal.record_job_run(p_job, true);
  exception when others then
    perform internal.record_job_run(p_job, false, sqlstate);
  end;
end;
$$;

revoke execute on function internal.record_job_run(text, boolean, text), internal.environment(),
  internal.call_job(text), internal.run_scheduled_job(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.svc_record_job_run(text, boolean, text), public.svc_job_health()
  from public, anon, authenticated;
grant execute on function public.svc_record_job_run(text, boolean, text), public.svc_job_health() to service_role;


-- ===== Schedules (UTC = WIB - 7) =====

select cron.schedule('expire_stale_bookings', '*/5 * * * *', $$select internal.run_scheduled_job('expire_stale_bookings')$$);
select cron.schedule('process-notifications', '* * * * *', $$select internal.call_job('process-notifications')$$);
select cron.schedule('payments-poll', '*/5 * * * *', $$select internal.call_job('payments-poll')$$);
select cron.schedule('anomaly-scan', '*/5 * * * *', $$select internal.call_job('anomaly-scan')$$);
select cron.schedule('enqueue_visit_reminders', '0 2 * * *', $$select internal.run_scheduled_job('enqueue_visit_reminders')$$);
select cron.schedule('close_past_bookings', '30 16 * * *', $$select internal.run_scheduled_job('close_past_bookings')$$);
select cron.schedule('generate_visit_sessions', '0 17 * * *', $$select internal.run_scheduled_job('generate_visit_sessions')$$);
select cron.schedule('purge/retention', '0 19 * * *', $$select internal.run_scheduled_job('purge/retention')$$);
select cron.schedule('purge-storage', '15 19 * * *', $$select internal.call_job('purge-storage')$$);
select cron.schedule('reconcile-payments', '30 19 * * *', $$select internal.call_job('reconcile-payments')$$);
select cron.schedule('prune_rate_limit_buckets', '15 * * * *', $$select internal.run_scheduled_job('prune_rate_limit_buckets')$$);
select cron.schedule('prune_operational_tables', '0 18 1 * *', $$select internal.run_scheduled_job('prune_operational_tables')$$);
