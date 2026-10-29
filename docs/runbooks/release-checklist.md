# Runbook: releasing to staging or production

Owner: Dev on call. Source of truth: `CLAUDE.md` §6.4 and §10.1, `docs/Task.md` P5.3.03 and P5.7.02, `docs/Security.md` §13.1. Task P5.3.03 adds the Midtrans sandbox checklist here; this page starts with the order every release keeps and the notes particular changes need.

## The order of a release

1. **Migrate first.** `pnpm db:push --linked` applies the new migrations to the target project. Only CI runs it; nobody pushes production by hand (`CLAUDE.md` §12.1 no. 19). Production is migrated by `.github/workflows/release.yml` (Task P5.7.02; see "The production release job" below), staging by `.github/workflows/staging-db.yml` (`docs/runbooks/staging-setup.md`, part D). Both run by hand, from `main`, and as a dry run unless that box is unticked.
2. **Then deploy.** The Vercel deployment builds after the database has moved. The public pages are prerendered from the database: the RW pages are built from `rw_units` (`generateStaticParams`), and the redirects of `src/config/redirects.ts` point at RW pages that must exist. A build against an older database bakes in the old slugs.
3. **Then check.** Open `/api/health` (200 on production) and the pages the change touched.

A migration that stops is a release that stops: fix its cause, never edit an applied migration (`CLAUDE.md` §6.4).

## Notes for particular changes

### Follow-ups of the reviews of PR #106 and PR #107 (`20261105130000` to `20261105130200`; `20261105110100`)

- **Postgres 16 or later on the target.** `internal.backup_auth_snapshot()` (`20261105110100`) asks for the SET membership of `backup_reader`, which Postgres has only from 16 on. Check it before the first production release and record the answer (docs/Security.md §13.1, go-live #28):

  ```sql
  select current_setting('server_version_num')::int >= 160000 as ok, version();
  ```

  On an older server the weekly backup fails at the snapshot, closed; upgrade the project before go-live.
- **The D-1 reminder is queued once per visit day.** Its dedupe key now carries the day. Each 09:00 WIB run reminds of the next day only, so a reminder under the old key and one under the new key never name the same date, unless `enqueue_visit_reminders` is run by hand again on the release day after an earlier run that day; do not.
- **A new high alert, `booking_review_unresolved`.** On its first scan it raises one alert for every paid booking that has waited more than 24 hours for `resolve_booking_review`. Resolve them on /dashboard/bookings; each alert closes by itself once its booking is resolved. `paid_without_tickets` no longer fires for those bookings, and only for those: a booking under any other review still raises it (`20261105130300`). The nightly reconciliation reads the same rule, so a booking under `REVENUE_RULE_REFUSED`, `CHARGEBACK` or `PAID_WHILE_*` review that still owes tickets may open a `paid_without_tickets` issue on the first night.

### Task P3.9.03: the nightly reconciliation (`20261105090000_reconcile_payments.sql`)

- **Resume `reconcile-payments` on staging in this release, not before.** It was paused in `docs/runbooks/staging-setup.md` D.5 because its route did not exist, which is why `/api/health` reports its heartbeat as stalled. After the deploy:

  ```sql
  select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'reconcile-payments'), active := true);
  ```

  The job runs at 02:30 WIB. To see it work at once, run `select internal.call_job('reconcile-payments');` in the SQL editor, which sends the cron bearer from Vault itself, then a minute later check that `last_success_at` moved and `last_error_code` is empty: `select job, last_success_at, last_failure_at, last_error_code from public.job_heartbeats where job = 'reconcile-payments';`
- **The first run reports what is already wrong.** Every open mismatch on staging becomes a `reconciliation_issues` row on `/dashboard/finance/reconciliation`, and the day's `reconciliation_digest` alert is mailed to `SECURITY_ALERT_EMAIL`. Bookings still waiting under `REVENUE_RULE_REFUSED` show as `ledger_sum_mismatch`; close each issue once its cause is fixed. A failed run with `orders_not_checked` means Midtrans did not answer every order asked, and `chains_not_checked` that no time was left for the chain walk; the next night tries again. Payments settled in the last 7 days take turns, so a busy week is covered over a few nights.

### Task P4.3.10: the officer's booking at the counter and cash (`20261104220000`, `20261104220100`)

- **The QR kid must be in `qr.signing_kids` before the deploy.** The migration seeds `["k1"]`. Check that it holds the deployed `QR_SIGNING_ACTIVE_KID`: `select value from public.site_settings where key = 'qr.signing_kids';`. Otherwise cash at the counter is refused ("Kunci tanda tangan tiket belum terdaftar") and `/api/health` answers 503 (`unknownQrKid` in the server log). `docs/runbooks/rotate-keys.md` adds a new kid to the list before it becomes active.
- **Officer holds run longer.** A booking an officer makes for one RW is held until 23:59 WIB of its visit day (docs/PRD.md §13.1 A23). One Snap page still lives 24 hours at most, the payment reminder comes before the first session, and a hold unpaid for 7 days raises the medium alert `admin_hold_unpaid_long`. The list filter "Booking petugas belum dibayar" on /dashboard/bookings shows them.

### Task P2.10.03: RW 13 and RW 08's new programme (`20261022080000_rw_13_and_rw_08_programme.sql`)

- **Migrate before the deploy.** The deploy carries the 308 redirects from `/rw-08-kampung-seni-budaya` and its `/jadwal` to `/rw-13-kampung-budaya-seni`. Without the migration that page does not exist yet, so the redirect would lead to a not-found page.
- **The migration stops while RW 8 still holds the arts programme.** `internal.require_rw_programme_change(8)` raises when RW 8 has anything that would change meaning under the new programme:
  - bookings, booking legs, tickets, payments, ledger entries or payout batches;
  - published packages or legs of published combos;
  - active session templates, or sessions from today on;
  - products, vendors or performance schedules;
  - admins, or open admin invitations.

  The error names each kind and its count. `select * from internal.rw_programme_ties(8::smallint)` lists the same before you start. Move those rows to RW 13, or close them, by hand. Then run the release again.
- **Notices, not stops.** Gallery items, articles, booklets, activity points, the RW 08 profile text and photo, and files under `rw-08/` are reported as notices. They do not stop the release; rewrite them in the CMS for the new programme afterwards.
- **Check afterwards.**
  - `/rw-13-kampung-budaya-seni` and `/rw-08-inklusif-ramah-anak` answer 200.
  - `/rw-08-kampung-seni-budaya` answers 308 to RW 13.
  - `select id, slug, is_active, sort_order from public.rw_units order by sort_order` reads 5, 13, 8, all online.

### Task P3.5: the booking wizard (`/pesan/[packageSlug]`, PR #27; `20261022140000_booking_wizard_review.sql`)

- **`booking_enabled` is off on every database** (`20261023090000`, second review of PR #27, N1) until Task P3.7.03 (`/reservasi/[bookingCode]/bayar`) and Task P3.12.01 (`/reservasi/[bookingCode]`) are released, when the later of the two turns it on again in a migration. Nobody turns it on by hand before that. A hold sends the visitor to its pay page and a quotation to its status page; until then both answer 404, while the hold keeps its seats until it lapses (independent review of PR #27, rollout note).
  - Check: `select value from public.site_settings where key = 'booking_enabled'` reads `false`. While it does, the wizard says that booking is closed, and `createBookingAction` books nothing.
  - A trial on staging may open it by hand with the superadmin's fresh TOTP (`site_settings_fresh_totp_update`), and closes it again afterwards.
- **Migrate before the deploy.** The new code reads `visit_date` and `visit_date_end` from the reply of `internal.create_booking`, and refunds limits through `public.svc_rate_limit_refund`. Against the older database every booking would fail the reply check.

### Task P3.11, first PR: every message, the channel switches, alerts and health (`20261024120000` to `20261024120200`)

- **Only Vercel previews and production send for real.** A server run anywhere else, `pnpm start` with real keys in `.env.local` included, delivers to the local Mailpit or to nothing (`messageDelivery`).
- **The worker now sends every template.** Messages queued before this release for templates it could not send yet (`booking_created`, `payment_received_ticket`, the staff emails) go out on its first runs, unless their channel is switched off, which cancels them.
- **WhatsApp stays silent while `whatsapp_enabled` is off.** Keep it off until the kelurahan's number and templates are approved (P0.1.08); nothing reaches Meta.
- **Security alerts are emailed to `SECURITY_ALERT_EMAIL` even while `email_enabled` is off**, so check that address is the operator's before deploying to staging.
- **Point the uptime monitor at `/api/health`** (P0.1.12). It answers 503 while any job is stalled, so on staging it stays red until `reconcile-payments` and `anomaly-scan` ship or are paused deliberately.

### Tasks P3.9 and P3.10: the ledger, the payments poll and tickets (`20261024100000` to `20261024100300`)

- **Migrate and deploy in one window.** `public.svc_apply_payment_event` now takes the QR kid of new tickets (`p_key_id`) and its older form is dropped, so between the migration and the deploy every Midtrans notification answers 503 and Midtrans retries it. Afterwards, settle one sandbox order on staging and check that it is applied with its ticket.
- **The QR kid is lowercase letters and digits.** `src/lib/env.ts` now stops the server at boot on any other `QR_SIGNING_ACTIVE_KID`; the `k1` of `scripts/generate-staging-secrets.mjs` passes.
- **Resume `payments-poll` on staging in this release, not before.** It was paused in `docs/runbooks/staging-setup.md` D.5 because its route did not exist. After the deploy:

  ```sql
  select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'payments-poll'), active := true);
  select job, last_success_at, last_failure_at, last_error_code from public.job_heartbeats where job = 'payments-poll';
  ```

  Within five minutes `last_success_at` moves and `last_error_code` stays empty. `anomaly-scan` and `reconcile-payments` stay paused until their own routes ship.
- **The first runs on staging backfill earlier paid bookings.** Every paid booking settled before this release lacks its ledger and tickets, so the poll completes them about 20 a run, each written ticket raising one medium `tickets_reissued` alert. Acknowledge those alerts in one go. The default revenue rules start on the day their migration ran, so a booking settled earlier finds no rule for its Jakarta day and waits under `REVENUE_RULE_REFUSED`; the poll retries it each run. To clear it, a superadmin adds a rule that covers that day, or, while no ledger row uses the default rules yet, moves their `effective_from` back to the first staging settlement. Production has no earlier settlements.

## The production release job

`.github/workflows/release.yml` (Task P5.7.02) runs on **Run workflow** only, before go-live and after it, behind a reviewer's approval (decision of 2026-10-28, review of PR #98, L7). No merge pushes production by itself.

### One-time setup (owner)

1. **The environment `production`.** Settings > Environments > New environment `production`:
   - **Deployment branches:** `main` only. This rule is what keeps another branch's code away from the production secrets. The job's own `if: github.ref == 'refs/heads/main'` is defence in depth only, since anyone who can push a branch can edit that line on it.
   - **Required reviewers:** the owner, and a second maintainer once there is one.
   - **Prevent self-review:** on, so the person who started a run cannot approve it.
2. **Its secrets.**
   - `SUPABASE_ACCESS_TOKEN`: a personal access token of the project owner, for `supabase link`, the pre-flight and the Advisor.
   - `SUPABASE_DB_URL`: the session pooler's connection string of `gisikdrono-prod` (Connect > Session pooler), port 5432, user `postgres.<ref>`, without `sslmode` or with `sslmode=verify-full`. GitHub's runners reach the internet over IPv4 only, and the direct host `db.<ref>.supabase.co` answers over IPv6 only, so the direct string cannot work here (L5).
3. **Network restrictions (DB-06): deferred.** Decision of 2026-10-28, review of PR #98, N4; Task P5.8.02.
   - A GitHub runner has no fixed address, and `supabase db push` connects to the database itself. So production's database gets no network restriction until a runner with a fixed egress address, or a self-hosted runner, exists.
   - Until then the release and the backup reach it through the session pooler, each with its own credentials and verified TLS.
   - **Never add an allow-list rule open to the world** (`0.0.0.0/0`, `::/0`) to let a run through.
   - Revisit this when that runner exists.

### What a run does

1. **Approval.** The job runs in the GitHub environment `production`. A required reviewer approves the run before any step starts.
2. **The project.** The project ref comes from `SUPABASE_DB_URL` itself (`scripts/supabase-db-url.mjs`). The Management API must name that project `gisikdrono-prod`, or nothing runs.
3. **The pre-flight.** `scripts/release-preflight.sql` runs through the Management API, in a transaction it turns read only first (L4). It stops the release when an existing row would fail a check that a migration adds, and it reports counts only:
   - **Profiles** (`20261104140000`): no profile holds a role, or is active, without `became_staff_at`.

     ```sql
     select count(*) from public.profiles where (role <> 'none' or is_active) and became_staff_at is null;
     ```

     A row it counts is an account set up by hand outside `accept_staff_invite`. Deactivate it, or give it `became_staff_at` through the privileged path that part E of the staging runbook uses.
   - **Bank account numbers** (`20261104121000`, L-3): every UMKM vendor's `bank_account_number` and every RW's `treasury_account_number` is empty or 5 to 20 digits.

     ```sql
     select count(*) from public.umkm_vendors where bank_account_number !~ '^[0-9]{5,20}$';
     select count(*) from public.rw_units where treasury_account_number !~ '^[0-9]{5,20}$';
     ```

     The superadmin corrects a counted account in the dashboard (`set_vendor_bank_account` / `set_rw_treasury_account`), never in SQL.

   A column the target does not have yet is skipped; the migration that adds it decides. Add a check here, and to the file, whenever a migration adds a constraint that existing rows must already pass.
4. **The Security Advisor, before the push.** `supabase db advisors --linked --type security --fail-on error` must show no error (DB-01). An error already there stops the run before anything moves (L1).
5. **The migrations.** `supabase db push --linked --dry-run` lists them. With **dry_run** unticked, `supabase db push --linked --yes` applies them. The job never passes `--include-all` (it would apply a migration older than the last one applied) or `--include-seed`.
6. **The Security Advisor, after the push.** The same check again, when the run applied anything.
7. **Then deploy.** The Vercel production deployment follows the migration (step 2 of the order above). Record the run's link in the release notes.

### If a check fails after the push

The migrations already applied stay: they are forward-only (`CLAUDE.md` §6.4).

1. **Do not deploy Vercel.** The previous production deployment keeps serving.
2. **Fix it with a new migration.** Write it on a branch and review it like any other, then run the release again. Never edit or revert an applied migration, and never fix production by hand in the SQL editor.
3. **If the Advisor's error exposes data** (a table without RLS, a function open to `anon`), treat it as an incident (`docs/runbooks/breach.md`) until the fixing migration is out.
