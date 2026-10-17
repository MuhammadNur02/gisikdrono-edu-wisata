-- 0007_cron: the scheduled jobs and their heartbeats (docs/PRD.md §8.9, docs/Security.md §11.3, Task P1.6.01,
-- P1.6.02, P1.6.03; decisions of 2026-10-17 and of the security review of PR #5).
--
-- pg_cron runs every job as postgres. A job that works in the database runs through run_scheduled_job, which
-- calls its function by name from a fixed list, so no schedule carries dynamic SQL. A job that needs the
-- application (the outbox worker, Midtrans polling, reconciliation, the anomaly scan, Storage deletes) runs
-- through call_job, which posts to its /api/jobs route with the CRON_SECRET bearer from Vault.
--
-- job_heartbeats lists every job with how long it may go without a success. A database job records its run when
-- it returns; an application job's route reports through svc_record_job_run when it finishes, and
-- check_job_responses turns a route that answered 400 or worse, timed out or never answered into a failed run.
-- A failed run is a cron_failed security event, and /api/health (Task P3.11.07) answers 503 for any job that has
-- gone longer than its limit without a success, so no job can stop quietly. Only a database whose Vault secret
-- environment is 'local' (written by pnpm db:seed) skips application jobs quietly when it has no secrets; a
-- database without the marker, or with a value outside the allow-list, counts as hosted.


-- ===== Heartbeats =====

create table public.job_heartbeats (
  job               text primary key,
  kind              text not null check (kind in ('database', 'application')),
  max_age           interval not null,
  watching_since    timestamptz not null default now(),
  last_success_at   timestamptz,
  last_failure_at   timestamptz,
  last_error_code   text check (length(last_error_code) <= 64),
  last_request_id   bigint,
  last_requested_at timestamptz,
  updated_at        timestamptz not null default now()
);
alter table public.job_heartbeats enable row level security;
alter table public.job_heartbeats force row level security;
revoke all on public.job_heartbeats from anon, authenticated;
-- The service role reads heartbeats through svc_job_health only and never writes them directly.
revoke insert, update, delete, truncate on public.job_heartbeats from service_role;
create trigger set_updated_at before update on public.job_heartbeats
  for each row execute function public.set_updated_at();

-- A watched job may go a little longer than its schedule's period without a success before it counts as stalled.
insert into public.job_heartbeats (job, kind, max_age) values
  ('expire_stale_bookings', 'database', interval '15 minutes'),
  ('process-notifications', 'application', interval '15 minutes'),
  ('payments-poll', 'application', interval '15 minutes'),
  ('anomaly-scan', 'application', interval '15 minutes'),
  ('check_job_responses', 'database', interval '15 minutes'),
  ('prune_rate_limit_buckets', 'database', interval '2 hours'),
  ('purge-storage', 'application', interval '2 hours'),
  ('enqueue_visit_reminders', 'database', interval '26 hours'),
  ('close_past_bookings', 'database', interval '26 hours'),
  ('generate_visit_sessions', 'database', interval '26 hours'),
  ('purge/retention', 'database', interval '26 hours'),
  ('reconcile-payments', 'application', interval '26 hours'),
  ('prune_operational_tables', 'database', interval '32 days');

-- The superadmin may look at the jobs; only the functions below write them.
grant select (job, kind, max_age, watching_since, last_success_at, last_failure_at, last_error_code, last_request_id,
              last_requested_at, updated_at)
  on public.job_heartbeats to authenticated;
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
  update public.job_heartbeats
  set last_success_at = case when p_succeeded then now() else last_success_at end,
      last_failure_at = case when p_succeeded then last_failure_at else now() end,
      last_error_code = case when p_succeeded then last_error_code else p_error_code end
  where job = p_job;
  if not found then
    raise exception 'no job is called %', p_job using errcode = '22023';
  end if;

  if not p_succeeded then
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('cron_failed', 'high', 'job', p_job, jsonb_build_object('job', p_job, 'error_code', p_error_code));
  end if;
end;
$$;


-- ===== Jobs that call the application (Task P1.6.02) =====

-- The environment this database belongs to, from the Vault secret environment, held to an allow-list: 'local'
-- (pnpm db:seed), 'staging' or 'production' (Task P0.3.03), case and surrounding spaces ignored. Any other value
-- is 'unrecognised', and NULL means nobody set it; both count as hosted.
create function internal.environment() returns text
  language sql stable security definer
  set search_path = ''
as $$
  select case when lower(btrim(s.decrypted_secret)) in ('local', 'staging', 'production')
              then lower(btrim(s.decrypted_secret)) else 'unrecognised' end
  from vault.decrypted_secrets s where s.name = 'environment';
$$;

-- Looks at the answer to an application job's last request. A route that finished reported its own success or
-- failure; this records what it could not: an answer of 400 or worse it did not report itself, a timeout, a
-- transport error, or no answer at all within 15 minutes. pg_net keeps answers for six hours.
create function internal.settle_job_response(p_job text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  no_answer_limit constant interval := interval '15 minutes';
  heartbeat record;
  answer record;
  has_answer boolean;
  error_code text;
begin
  select h.last_request_id, h.last_requested_at, h.last_failure_at into heartbeat
  from public.job_heartbeats h where h.job = p_job and h.last_request_id is not null;
  if not found then
    return;
  end if;
  select r.status_code, r.timed_out, r.error_msg into answer
  from net._http_response r where r.id = heartbeat.last_request_id;
  has_answer := found;
  if not has_answer and heartbeat.last_requested_at > now() - no_answer_limit then
    return;
  end if;

  error_code := case
    when not has_answer then 'no_response'
    when answer.timed_out then 'timeout'
    when answer.error_msg is not null then 'request_failed'
    when answer.status_code >= 400 then 'http_' || answer.status_code
  end;
  update public.job_heartbeats set last_request_id = null where job = p_job;
  -- A route that failed has already recorded its failure after the request went out.
  if error_code is not null
     and (heartbeat.last_failure_at is null or heartbeat.last_failure_at < heartbeat.last_requested_at) then
    perform internal.record_job_run(p_job, false, error_code);
  end if;
end;
$$;

-- Posts one application job to its route. The base URL and the bearer come from Vault (jobs_base_url,
-- cron_secret), set per environment like the other secrets of Task P0.3.03, and the bearer only ever travels over
-- HTTPS outside a local database. Before a new request it settles the previous one; a request still unanswered by
-- then is no longer followed, and the job's max_age catches a route that never answers. Returns the pg_net request
-- id, or NULL when nothing was sent: quietly on a local database without secrets, as a failed run everywhere else.
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
  is_local boolean := internal.environment() is not distinct from 'local';
  base_url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jobs_base_url');
  cron_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'cron_secret');
  request_id bigint;
begin
  if path is null then
    raise exception 'no application job is called %', p_job using errcode = '22023';
  end if;
  perform internal.settle_job_response(p_job);
  if base_url is null or cron_secret is null then
    if not is_local then
      perform internal.record_job_run(p_job, false, 'secret_missing');
    end if;
    return null;
  end if;
  if base_url !~ '^https://' and not is_local then
    perform internal.record_job_run(p_job, false, 'insecure_base_url');
    return null;
  end if;

  -- process-notifications is a POST because it claims and changes outbox rows; the others read first.
  if p_job = 'process-notifications' then
    request_id := net.http_post(url := rtrim(base_url, '/') || path, body := '{}'::jsonb,
                                headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret,
                                                              'Content-Type', 'application/json'),
                                timeout_milliseconds := route_timeout_ms);
  else
    request_id := net.http_get(url := rtrim(base_url, '/') || path,
                               headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
                               timeout_milliseconds := route_timeout_ms);
  end if;
  update public.job_heartbeats set last_request_id = request_id, last_requested_at = now() where job = p_job;
  return request_id;
end;
$$;

-- The application jobs report back when their route has finished (Task P3.11.07 and the job routes). Only they
-- may: a database job records its own run.
create function public.svc_record_job_run(p_job text, p_succeeded boolean, p_error_code text default null)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.job_heartbeats h where h.job = p_job and h.kind = 'application') then
    raise exception 'only an application job reports its run, and % is not one', p_job using errcode = '22023';
  end if;
  perform internal.record_job_run(p_job, p_succeeded, p_error_code);
end;
$$;

-- What /api/health reads. A job is stalled when it has gone longer than its max_age without a success since it
-- was first watched; an application job is never stalled on a local database, where it runs only if a developer
-- gives it secrets.
create function public.svc_job_health()
  returns table (job text, kind text, last_success_at timestamptz, last_failure_at timestamptz,
                 last_error_code text, is_stalled boolean)
  language sql stable security definer
  set search_path = ''
as $$
  select h.job, h.kind, h.last_success_at, h.last_failure_at, h.last_error_code,
         (h.kind = 'database' or internal.environment() is distinct from 'local')
           and coalesce(h.last_success_at, h.watching_since) < now() - h.max_age
  from public.job_heartbeats h
  order by h.job;
$$;


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

-- Settles the answers of every application job, for the ones whose next call is hours away.
create function internal.check_job_responses() returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  pending text;
begin
  for pending in select h.job from public.job_heartbeats h where h.kind = 'application' and h.last_request_id is not null
  loop
    perform internal.settle_job_response(pending);
  end loop;
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
  if not exists (select 1 from public.job_heartbeats h where h.job = p_job and h.kind = 'database') then
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
      when 'check_job_responses' then
        perform internal.check_job_responses();
    end case;
    perform internal.record_job_run(p_job, true);
  exception when others then
    perform internal.record_job_run(p_job, false, sqlstate);
  end;
end;
$$;

revoke execute on function internal.record_job_run(text, boolean, text), internal.environment(),
  internal.settle_job_response(text), internal.call_job(text), internal.check_job_responses(),
  internal.run_scheduled_job(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.svc_record_job_run(text, boolean, text), public.svc_job_health()
  from public, anon, authenticated;
grant execute on function public.svc_record_job_run(text, boolean, text), public.svc_job_health() to service_role;


-- ===== Schedules (UTC = WIB - 7) =====

select cron.schedule('expire_stale_bookings', '*/5 * * * *', $$select internal.run_scheduled_job('expire_stale_bookings')$$);
select cron.schedule('process-notifications', '* * * * *', $$select internal.call_job('process-notifications')$$);
select cron.schedule('payments-poll', '*/5 * * * *', $$select internal.call_job('payments-poll')$$);
select cron.schedule('anomaly-scan', '*/5 * * * *', $$select internal.call_job('anomaly-scan')$$);
select cron.schedule('check_job_responses', '*/5 * * * *', $$select internal.run_scheduled_job('check_job_responses')$$);
select cron.schedule('enqueue_visit_reminders', '0 2 * * *', $$select internal.run_scheduled_job('enqueue_visit_reminders')$$);
select cron.schedule('close_past_bookings', '30 16 * * *', $$select internal.run_scheduled_job('close_past_bookings')$$);
select cron.schedule('generate_visit_sessions', '0 17 * * *', $$select internal.run_scheduled_job('generate_visit_sessions')$$);
select cron.schedule('purge/retention', '0 19 * * *', $$select internal.run_scheduled_job('purge/retention')$$);
-- Hourly, so raw quarantine uploads go within a day and the files the 02:00 WIB retention run marks go at 02:15.
select cron.schedule('purge-storage', '15 * * * *', $$select internal.call_job('purge-storage')$$);
select cron.schedule('reconcile-payments', '30 19 * * *', $$select internal.call_job('reconcile-payments')$$);
select cron.schedule('prune_rate_limit_buckets', '15 * * * *', $$select internal.run_scheduled_job('prune_rate_limit_buckets')$$);
select cron.schedule('prune_operational_tables', '0 18 1 * *', $$select internal.run_scheduled_job('prune_operational_tables')$$);
