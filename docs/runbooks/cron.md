# Runbook: scheduled jobs (pg_cron and pg_net)

Owner: Dev on call. Source of truth: `supabase/migrations/0007_cron.sql`, `docs/PRD.md` §8.9, `docs/Security.md` §11.3.

## What runs

Times are stored in UTC; WIB = UTC + 7. Every job runs as `postgres`.

| Job | UTC | WIB | Runs |
|---|---|---|---|
| `expire_stale_bookings` | `*/5 * * * *` | every 5 min | `internal.run_scheduled_job` |
| `process-notifications` | `* * * * *` | every minute | `internal.call_job` → `POST /api/jobs/process-notifications` |
| `payments-poll` | `*/5 * * * *` | every 5 min | `internal.call_job` → `POST /api/jobs/payments-poll` |
| `anomaly-scan` | `*/5 * * * *` | every 5 min | `internal.call_job` → `POST /api/jobs/anomaly-scan` |
| `check_job_responses` | `*/5 * * * *` | every 5 min | `internal.run_scheduled_job`, reads the routes' answers in `net._http_response` |
| `enqueue_visit_reminders` | `0 2 * * *` | 09:00 | `internal.run_scheduled_job` |
| `close_past_bookings` | `30 16 * * *` | 23:30 | `internal.run_scheduled_job` (also `reconcile_session_counters`) |
| `generate_visit_sessions` | `0 17 * * *` | 00:00 | `internal.run_scheduled_job`, horizon `booking.max_advance_days` |
| `purge/retention` | `0 19 * * *` | 02:00 | `internal.run_scheduled_job` (`purge_participants`, `anonymise_booker_pii`) |
| `purge-storage` | `15 * * * *` | hourly at :15 (so 02:15 after the retention run) | `internal.call_job` → `POST /api/jobs/purge-storage` |
| `reconcile-payments` | `30 19 * * *` | 02:30 | `internal.call_job` → `POST /api/jobs/reconcile-payments` |
| `prune_rate_limit_buckets` | `15 * * * *` | hourly | `internal.run_scheduled_job` |
| `prune_operational_tables` | `0 18 1 * *` | 01:00 on the 2nd | `internal.run_scheduled_job` |

## Heartbeats and failures

- `public.job_heartbeats` lists every job with its `kind` (`database` or `application`), its `max_age` (how long it may go without a success: 15 min for the five-minute jobs, 2 h for the hourly ones, 26 h for the nightly ones, 32 days for the monthly prune), `last_success_at`, `last_failure_at` and `last_error_code`. A database job writes it when it returns; an application job's route writes it through `svc_record_job_run` when it finishes, and only an application job may report there.
- `call_job` keeps the pg_net request id of each application job's last call. `check_job_responses` and the next call read its answer in `net._http_response`: an answer of 400 or worse the route did not report itself is `http_<status>`, a timeout `timeout`, a transport error `request_failed`, and no answer within 15 minutes `no_response`. A request still unanswered when the next one goes out is no longer followed; `max_age` catches a route that never answers.
- A failed run is also a `security_events` row of type `cron_failed` (entity `job`, the job name as `entity_id`). `purge-storage` counts a run that left any file undeleted as failed (`files_not_deleted`).
- `svc_job_health()` returns every job with `is_stalled`: no success for longer than its `max_age` since it was first watched. `/api/health` answers 503 while any job is stalled (Task P3.11.07). On a local database the application jobs are never stalled.

## Vault secrets per environment

Set once per project in the SQL editor, never in a migration or a seed file (Task P0.3.03):

```sql
select vault.create_secret('<value>', 'environment');    -- 'staging' or 'production'
select vault.create_secret('<value>', 'jobs_base_url');  -- e.g. https://staging.<domain>
select vault.create_secret('<value>', 'cron_secret');    -- the CRON_SECRET of that Vercel environment
select vault.create_secret('<value>', 'otp_pepper');     -- the OTP_PEPPER of that Vercel environment
```

Change a value with `select vault.update_secret((select id from vault.secrets where name = '<name>'), '<value>');`.

- Without `jobs_base_url` or `cron_secret`, every application job is a failed run with `last_error_code = 'secret_missing'`, so `/api/health` turns red within 15 minutes. A `jobs_base_url` that is not `https://` is refused the same way (`insecure_base_url`), so the bearer never travels in clear.
- `environment` is read in lower case without surrounding spaces and must be `local`, `staging` or `production`; any other value is `unrecognised`. A database without the secret, or with an unrecognised value, counts as hosted and fails loudly. Only `local`, which `pnpm db:seed` writes on a developer's database, lets an application job skip quietly when its secrets are missing and allows a plain-HTTP `jobs_base_url`.
- pg_net keeps each queued request, with its `Authorization` header, in `net.http_request_queue` until its worker sends it, a matter of seconds. The `net` schema is not exposed through the API (`[api] schemas = ["public"]`) and no `net` table is in the Realtime publication (`supabase/tests/schema_cron.sql`); keep it that way.
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

A paused job turns `/api/health` red once it passes its `max_age`. That is intended: record the incident and the pause in `audit_logs` (`incident.*`) so the alert is expected.
