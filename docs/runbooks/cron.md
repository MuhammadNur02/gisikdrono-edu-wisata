# Runbook: scheduled jobs (pg_cron and pg_net)

Owner: Dev on call. Source of truth: `supabase/migrations/0007_cron.sql`, `docs/PRD.md` §8.9, `docs/Security.md` §11.3.

## What runs

Times are stored in UTC; WIB = UTC + 7. Every job runs as `postgres`.

| Job | UTC | WIB | Runs |
|---|---|---|---|
| `expire_stale_bookings` | `*/5 * * * *` | every 5 min | `internal.run_scheduled_job` |
| `process-notifications` | `* * * * *` | every minute | `internal.call_job` → `POST /api/jobs/process-notifications` |
| `payments-poll` | `*/5 * * * *` | every 5 min | `internal.call_job` → `GET /api/jobs/payments-poll` |
| `anomaly-scan` | `*/5 * * * *` | every 5 min | `internal.call_job` → `GET /api/jobs/anomaly-scan` |
| `enqueue_visit_reminders` | `0 2 * * *` | 09:00 | `internal.run_scheduled_job` |
| `close_past_bookings` | `30 16 * * *` | 23:30 | `internal.run_scheduled_job` (also `reconcile_session_counters`) |
| `generate_visit_sessions` | `0 17 * * *` | 00:00 | `internal.run_scheduled_job`, horizon `booking.max_advance_days` |
| `purge/retention` | `0 19 * * *` | 02:00 | `internal.run_scheduled_job` (`purge_participants`, `anonymise_booker_pii`) |
| `purge-storage` | `15 19 * * *` | 02:15 | `internal.call_job` → `GET /api/jobs/purge-storage` |
| `reconcile-payments` | `30 19 * * *` | 02:30 | `internal.call_job` → `GET /api/jobs/reconcile-payments` |
| `prune_rate_limit_buckets` | `15 * * * *` | hourly | `internal.run_scheduled_job` |
| `prune_operational_tables` | `0 18 1 * *` | 01:00 on the 2nd | `internal.run_scheduled_job` |

## Heartbeats and failures

- `public.job_heartbeats` holds each job's `last_success_at`, `last_failure_at` and `last_error_code`. A database job writes it when it returns; an application job's route writes it through `svc_record_job_run` when it finishes.
- A failed run is also a `security_events` row of type `cron_failed` (entity `job`, the job name as `entity_id`).
- `/api/health` answers 503 when `expire_stale_bookings`, `process-notifications` or `payments-poll` has no success in the last 15 minutes (Task P3.11.07).

## Vault secrets per environment

Set once per project in the SQL editor, never in a migration or a seed file (Task P0.3.03):

```sql
select vault.create_secret('<value>', 'environment');    -- 'staging' or 'production'
select vault.create_secret('<value>', 'jobs_base_url');  -- e.g. https://staging.<domain>
select vault.create_secret('<value>', 'cron_secret');    -- the CRON_SECRET of that Vercel environment
select vault.create_secret('<value>', 'otp_pepper');     -- the OTP_PEPPER of that Vercel environment
```

Change a value with `select vault.update_secret((select id from vault.secrets where name = '<name>'), '<value>');`.

- Without `jobs_base_url` or `cron_secret`, every application job is a failed run with `last_error_code = 'secret_missing'`, so `/api/health` turns red within 15 minutes.
- A database without the `environment` secret counts as hosted and fails loudly. Only `environment = 'local'`, which `supabase/seed.sql` writes on a developer's database, lets an application job skip quietly when its secrets are missing.
- To exercise the application jobs locally, add `jobs_base_url = 'http://host.docker.internal:3000'` and the `CRON_SECRET` of your `.env.local` to the local Vault. `pnpm db:reset` removes them again.

## Looking at a job

```sql
select jobid, jobname, schedule, active from cron.job order by jobname;
select status, return_message, start_time, end_time
  from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'payments-poll')
  order by start_time desc limit 20;
select * from public.job_heartbeats order by job;
select occurred_at, entity_id, details from public.security_events
  where event_type = 'cron_failed' order by occurred_at desc limit 20;
-- Replies of the application routes, kept by pg_net for 6 hours:
select id, status_code, error_msg, created from net._http_response order by created desc limit 20;
```

## Pausing a job during an incident

Pause, keeping the schedule:

```sql
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'process-notifications'), active := false);
```

Resume with `active := true`. To remove a job entirely, use `select cron.unschedule('process-notifications');` and recreate it later with the exact `cron.schedule(...)` line from `0007_cron.sql`. The pgTAP suite `supabase/tests/schema_cron.sql` fails until it is back.

A paused watched job turns `/api/health` red after 15 minutes. That is intended: record the incident and the pause in `audit_logs` (`incident.*`) so the alert is expected.
