# Runbook: backups and the restore drill

Owner: Dev on call, with the kelurahan's vault holder for the private key. Source of truth: `docs/Security.md` §7.8 (RES-01, DB-07), `docs/PRD.md` NFR-08, `docs/Task.md` P5.5.04. The weekly job is `.github/workflows/backup.yml`; this page sets it up, restores from it, and records each drill.

**Targets.** RPO 24 hours (1 hour with the PITR add-on), RTO 4 hours for the database (NFR-08). Supabase Pro keeps daily backups for 7 days. The R2 copy is the off-site one, and the only one that outlives the Supabase account.

## A. One-time setup (owner)

1. **The age key pair.** On the vault holder's machine, run `age-keygen -o gisikdrono-backup.key`. The file holds the private key (`AGE-SECRET-KEY-1...`); store it in the vault, never in the repository, GitHub or a chat. Its `# public key: age1...` line is `BACKUP_AGE_PUBLIC_KEY`. Delete the file once the vault holds it.
2. **The R2 bucket.** In Cloudflare R2, create a private bucket with no public access and no custom domain. Add a lifecycle rule that deletes objects under `postgres/` after 56 days (8 weeks, Security.md §7.8). Create an R2 API token with **Object Read & Write** on that bucket only. Its access key id, secret and the account id are `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_ACCOUNT_ID`; the bucket name is `R2_BUCKET`.
3. **Supabase's root certificate.** In the `gisikdrono-prod` dashboard, open Database settings > SSL configuration > Download certificate. Commit the file as `supabase/certs/prod-ca-2021.crt`. It is public and identifies Supabase's CA, so pg_dump can check the server (`PGSSLMODE=verify-full`) instead of merely encrypting. The job stops while the file is missing.
4. **The GitHub environment `production-backup`.** Settings > Environments > New environment. No required reviewers, so the Sunday run never waits. Deployment branches: `main` only. Secrets: `SUPABASE_DB_URL` (the `gisikdrono-prod` connection string, without `sslmode` or with `sslmode=verify-full`), `SUPABASE_ACCESS_TOKEN` (used only to check that the URL is `gisikdrono-prod`), `BACKUP_AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.
5. **The first run.** Actions > Weekly database backup > Run workflow. The summary names the object, its size and its sha256. The scheduled run fails every Sunday until the environment exists. Before go-live that is expected; after go-live a failed run is an incident: rerun it, and open `docs/runbooks/cron.md` if it fails twice.

## B. Fetch and decrypt a backup (vault holder's machine, never CI)

1. Find the object: `aws s3 ls s3://<bucket>/postgres/ --endpoint-url https://<account id>.r2.cloudflarestorage.com`. Use a read-only R2 token of your own, never the job's.
2. Download it, and compare `sha256sum` with the object's `sha256` metadata (`aws s3api head-object ...`) and the job summary.
3. Decrypt onto an encrypted disk: `age --decrypt -i <private key file> -o backup.dump <object>.dump.age`. The plain dump holds every booker's contact details. It never leaves that disk, and it is deleted when the drill or restore ends (step D.6).
4. Check that it reads: `pg_restore --list backup.dump > /dev/null`.

## C. The quarterly drill into `gisikdrono-staging`

The drill restores production data into staging, so for its length staging holds personal data. Each step below keeps that data from being seen or messaged.

1. **Close staging first.**
   - Turn on Vercel Authentication for the staging domain; remove its Deployment Protection Exception (`docs/runbooks/staging-setup.md`).
   - Pause every staging cron job: `select cron.alter_job(jobid, active := false) from cron.job;`. The restore carries production's `site_settings`, including the messaging switches, and production's queued `notifications`. With the jobs paused, nothing delivers them.
2. **Reset the staging schema.** Run `supabase db reset --linked` against `gisikdrono-staging` only. Check the linked ref first: `supabase projects list` names it `gisikdrono-staging`. It applies every migration and no seed.
3. **Load the data.**

   ```bash
   pg_restore --data-only --schema=public --schema=auth --file=data.sql backup.dump
   psql "<staging connection string, sslmode=verify-full>" --single-transaction -v ON_ERROR_STOP=1 \
     -c 'set session_replication_role = replica' -f data.sql
   ```

   The triggers stay off while the rows load, so the audit and hash chains keep production's values instead of new ones. Storage objects are not part of the dump: `public-media` has its own monthly mirror (Security.md §7.8), and `documents` are rendered again from their rows.

   > **First drill:** Supabase may already hold `auth` rows in a fresh project, or refuse a table of `auth`. Record every command that had to change here, so the next drill starts from commands that worked.
4. **Silence staging.**
   - `update public.site_settings set value = 'false' where key in ('whatsapp_enabled', 'email_enabled', 'booking_enabled');`
   - `update public.notifications set status = 'cancelled' where status in ('queued', 'sending');`
   - Then resume the jobs that send nothing: every job except `process-notifications`, which stays paused until step D.7.
5. **Check.**
   - **Row counts.** Count `bookings`, `payments`, `tickets_qr`, `revenue_share_entries`, `audit_logs` and `profiles` on production, through the Management API or the SQL editor. Staging must read the same.
   - **The chains.** `select internal.verify_ledger_chain(), internal.verify_audit_chain();` as `postgres` on staging: both pass.
   - **pgTAP.** `supabase test db --linked`. Each suite rolls back its own rows. A failure that comes from production's data rather than the restore is recorded in the table below, not fixed on staging.
   - **Smoke.** The Playwright suites run against the local stack only (`playwright.config.ts` has no remote base URL). Restore the same `data.sql` into `supabase start` and run `pnpm e2e` there. On staging, do these by hand: `/api/health` answers 200 (or 503 naming only `process-notifications`); a superadmin signs in with TOTP; `/dashboard` shows production's month figures; one ticket's `/v/<token>` reads valid.
6. **Note the times.**
   - **RTO:** from step B.1 to the end of step C.5.
   - **RPO:** the age of the dump, from the object's name to the moment the drill started.

## D. After the drill

1. Run `supabase db reset --linked` on `gisikdrono-staging` again. That leaves no production row on staging.
2. Run `.github/workflows/staging-db.yml` with `seed_demo` ticked, so staging holds demo content only again.
3. Restore staging's own `site_settings`, as part D of the staging runbook sets them.
4. Resume the cron jobs, `process-notifications` included.
5. Restore the staging domain's Deployment Protection Exception.
6. Delete `backup.dump`, `data.sql` and the downloaded object from the vault holder's machine.
7. Record the drill below, and in the quarterly review minutes (Security.md §13.2).

## E. A real restore of production

Use this when Supabase's own daily backups (or PITR) cannot help: the project or the account is lost, or every daily backup is too late. Open `docs/runbooks/breach.md` first if the loss came from an attack.

1. Put the site in `maintenance_mode` on what still answers, and tell the kelurahan office.
2. Create the new project in `ap-southeast-1`. Apply the migrations with `.github/workflows/release.yml`, with the new project named `gisikdrono-prod` and the environment's secrets updated.
3. Load the data as in part C, step 3, into the new project.
4. Leave the cron jobs paused, and the messaging switches as production had them.
5. Run the checks of part C, step 5.
6. Resume the jobs and lift `maintenance_mode`.
7. Point Vercel at the new project.

## Drill record

| Date | Backup (object) | RPO (age of the dump) | RTO (B.1 to C.5) | pgTAP | Smoke | Commands changed | By |
|---|---|---|---|---|---|---|---|
| (first drill pending: needs production and part A) | | | | | | | |

**PITR add-on.** Not yet decided: the owner decides with the Supabase Pro upgrade (Task P0.1.01). With it the RPO target is 1 hour; without it, 24 hours from the daily backups and 7 days from this weekly copy. Record the decision and its date here.
