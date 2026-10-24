# Runbook: releasing to staging or production

Owner: Dev on call. Source of truth: `CLAUDE.md` §6.4 and §10.1, `docs/Task.md` P5.3.03 and P5.7.02, `docs/Security.md` §13.1. Task P5.3.03 adds the Midtrans sandbox checklist here; this page starts with the order every release keeps and the notes particular changes need.

## The order of a release

1. **Migrate first.** `pnpm db:push --linked` applies the new migrations to the target project. Only CI runs it (`.github/workflows/release.yml`, Task P5.7.02); nobody pushes production by hand (`CLAUDE.md` §12.1 no. 19). Until that job exists, staging is migrated and then deployed by the manual `.github/workflows/staging-db.yml` (`docs/runbooks/staging-setup.md`, part D).
2. **Then deploy.** The Vercel deployment builds after the database has moved. The public pages are prerendered from the database: the RW pages are built from `rw_units` (`generateStaticParams`), and the redirects of `src/config/redirects.ts` point at RW pages that must exist. A build against an older database bakes in the old slugs.
3. **Then check.** Open `/api/health` (200 on production) and the pages the change touched.

A migration that stops is a release that stops: fix its cause, never edit an applied migration (`CLAUDE.md` §6.4).

## Notes for particular changes

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
