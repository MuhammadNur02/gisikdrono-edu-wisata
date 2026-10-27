# Runbook: backups and the restore drill

Owner: Dev on call, with the kelurahan's vault holder for the private key. Source of truth: `docs/Security.md` §7.8 (RES-01, DB-07), `docs/PRD.md` NFR-08 and §13.1 A27, `docs/Task.md` P5.5.04. The weekly job is `.github/workflows/backup.yml`; this page sets it up, restores from it, and records each drill.

**Targets.** RPO 24 hours (1 hour with the PITR add-on), RTO 4 hours for the database (NFR-08). Supabase Pro keeps daily backups for 7 days. The R2 copy is the off-site one, and the only one that outlives the Supabase account.

**What a backup holds.** The output of `pg_dump --format=custom`: every schema, its data and the Vault's encrypted secrets, so it holds every booker's contact details. It never holds the sessions, refresh and one-time tokens, flow state, MFA challenges or MFA factors of `auth` (`--exclude-table-data`, review of PR #98, M1). A restore therefore signs every staff member out and leaves them without an authenticator (part E).

**Where a restore may go** (PRD §13.1 A27, owner-delegated 2026-10-28):
- the drill: a throwaway local stack on the vault holder's encrypted machine;
- optionally, a hosted rehearsal in a temporary project made for it and deleted afterwards;
- and a real production restore.

It never goes into `gisikdrono-staging`, which holds no real visitor data. It never goes into any project bound to Vercel.

## A. One-time setup (owner, at go-live)

1. **The age key pair.** On the vault holder's machine, run `age-keygen -o gisikdrono-backup.key`. The file holds the private key (`AGE-SECRET-KEY-1...`). Store it in the vault, never in the repository, GitHub or a chat. Its `# public key: age1...` line is `BACKUP_AGE_PUBLIC_KEY`. Delete the file once the vault holds it.
2. **The R2 bucket.** In Cloudflare R2, create a private bucket with no public access and no custom domain. Give it two rules on the prefix `postgres/`:
   - a lifecycle rule that deletes objects after 56 days (8 weeks, Security.md §7.8);
   - a bucket lock rule that keeps them for 56 days, so neither a leaked token nor a mistake can delete or overwrite a backup sooner (review of PR #98, L6).

   Create an R2 API token with **Object Read & Write** on that bucket only. Its access key id, secret and the account id are `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_ACCOUNT_ID`; the bucket name is `R2_BUCKET`.
3. **Supabase's root certificate.** In the `gisikdrono-prod` dashboard, open Database settings > SSL configuration > Download certificate. Commit the file as `supabase/certs/prod-ca-2021.crt`. It is public and identifies Supabase's CA, so every connection of the job checks the server (`PGSSLMODE=verify-full`) instead of merely encrypting. The job stops while the file is missing.
4. **The backup role.** The migration `20261104190700_backup_reader.sql` makes the group `backup_reader`: it can read every table (`pg_read_all_data`) and call `internal.environment()`, and nothing else. In the `gisikdrono-prod` SQL editor, as `postgres`, create the login role that belongs to it, with a password generated into the vault:

   ```sql
   create role gisikdrono_backup with login bypassrls password '<from the vault>' in role backup_reader;
   ```

   It needs `bypassrls`: every table forces RLS, and without it `pg_dump` either stops or dumps no rows. If Supabase refuses the attribute or the grant, stop and record it here. Never dump as `postgres` instead.
5. **The connection string.** Use the session pooler: Connect > Session pooler, port 5432. Put the role and the ref in the user, `gisikdrono_backup.<ref>`, and leave out `sslmode` or set `sslmode=verify-full`. GitHub's runners have IPv4 only, and the direct host `db.<ref>.supabase.co` answers on IPv6 only. Check on the first run that the pooler's certificate verifies against the committed one; if it does not, stop and record it, never lower `PGSSLMODE`.
6. **The GitHub environment `production-backup`.** Settings > Environments > New environment:
   - No required reviewers, so the Sunday run never waits.
   - Deployment branches: `main` only.
   - Secrets: `SUPABASE_DB_URL` (the string of step 5), `BACKUP_AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.

   No access token: the job checks the project without the Management API.
7. **The repository variables.** Settings > Secrets and variables > Actions > Variables:
   - `PRODUCTION_PROJECT_REF`: the 20-letter ref of `gisikdrono-prod`. The job refuses any URL of another project.
   - `PRODUCTION_BACKUP_ENABLED`: `true`, set at go-live and not before. Until then the job is skipped. From then on a missing secret fails the run.
8. **The first run.** Actions > Weekly database backup > Run workflow. Before it dumps, the job checks:
   - the URL's ref against `PRODUCTION_PROJECT_REF`;
   - the database's Vault marker (`internal.environment()` must answer `production`).

   The summary names the object, its size and its sha256. After go-live a failed run is an incident: rerun it, and open `docs/runbooks/cron.md` if it fails twice.

## B. Fetch and decrypt a backup (vault holder's machine, never CI)

1. Find the object: `aws s3 ls s3://<bucket>/postgres/ --endpoint-url https://<account id>.r2.cloudflarestorage.com`. Use a read-only R2 token of your own, never the job's.
2. Download it. Compare its `sha256sum` with the object's `sha256` metadata (`aws s3api head-object ...`) and with the job summary.
3. Decrypt onto the machine's encrypted disk: `age --decrypt -i <private key file> -o backup.dump <object>.dump.age`. The plain dump never leaves that disk. Delete it when the drill or the restore ends (part D).
4. Check that it reads: `pg_restore --list backup.dump > /dev/null`.

## C. The quarterly drill (local stack, vault holder's machine)

The drill restores production data onto the vault holder's own machine and nowhere else. Its stack has no Vercel deployment, no messaging keys and no network exposure.

1. **A fresh stack.** In a checkout of `main`, run `supabase start`, then `supabase db reset`. That applies every migration and the reference seed. Do not run `pnpm db:seed`: the drill needs no development accounts.
2. **Pause cron, and check it.** Pause every job before any row is loaded. Then check that the count reads 0; the drill stops if it does not.

   ```sql
   select cron.alter_job(jobid, active := false) from cron.job;
   select count(*) as active_jobs from cron.job where active;
   ```

3. **Empty the seeded reference tables.** The migrations and `supabase/seed.sql` filled `rw_units`, `site_settings`, `revenue_share_rules` and their lines, and the other reference rows. A data-only load collides with them. Empty every table of `public` first, with the triggers off for the session:

   ```sql
   set session_replication_role = replica;
   do $$
   declare t record;
   begin
     for t in select tablename from pg_tables where schemaname = 'public' loop
       execute format('truncate table public.%I cascade', t.tablename);
     end loop;
   end;
   $$;
   ```

4. **Load `public`, never `auth`.** `auth` is restored only in a real production restore (part E). `profiles` loads without its `auth.users` rows because the triggers, foreign keys included, are off.

   ```bash
   pg_restore --data-only --schema=public --file=data.sql backup.dump
   psql "$LOCAL_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
     -c 'set session_replication_role = replica' -f data.sql
   ```

   `LOCAL_DB_URL` is the local stack's own database address, the `DB URL` line of `supabase status`.

   The audit and hash chains keep production's values, since no trigger writes new ones. Storage objects are not in the dump: `public-media` has its own monthly mirror (Security.md §7.8), and `documents` are rendered again from their rows.
5. **Check.**
   - **Row counts.** Count `bookings`, `payments`, `tickets_qr`, `revenue_share_entries`, `audit_logs` and `profiles` on production (the SQL editor), and on the local stack: they read the same.
   - **The chains.** `select internal.verify_ledger_chain(), internal.verify_audit_chain();` as `postgres`: both pass.
   - **pgTAP.** `pnpm db:test`. Each suite rolls back its own rows. Record a failure that comes from production's data rather than the restore in the table below; never fix it in the drill.
   - **Playwright.** `pnpm e2e` against the same stack. The suites create their own accounts and rows, so a pass means the app runs on production's data. No message leaves the machine: local runs deliver to Mailpit or nowhere.
6. **Note the times.**
   - **RTO:** from step B.1 to the end of step C.5.
   - **RPO:** the age of the dump, from the object's name to the moment the drill started.

### Optional: a hosted rehearsal

Use it once a year, or before a real restore is likely, to rehearse part E on Supabase itself.

1. **Make a project for this rehearsal only.** Name it `gisikdrono-drill-<YYYY-MM-DD>`, in `ap-southeast-1`, with no Vercel binding. In its network restrictions, allow the vault holder's IP alone.
2. **Restore.** Follow part E steps 2 to 5 against it, without lifting `maintenance_mode` and without pointing anything at it.
3. **Delete it the same day.** Delete the project, and with it its backups, then record the deletion and its date in the table below.

## D. After the drill

1. **Remove the local copy.** Run `supabase stop --no-backup`, so no local volume keeps production rows.
2. **Delete the files.** Delete `backup.dump`, `data.sql` and the downloaded object from the vault holder's machine.
3. **Record the drill** below, and in the quarterly review minutes (Security.md §13.2).

## E. A real restore of production

Use this when Supabase's own daily backups (or PITR) cannot help: the project or the account is lost, or every daily backup is too late. If the loss came from an attack, open `docs/runbooks/breach.md` first.

1. **Close the site.** Put it in `maintenance_mode` on whatever still answers, and tell the kelurahan office.
2. **Create the new project and migrate it.** Create the project in `ap-southeast-1`, named `gisikdrono-prod`. Update the environment's secrets and `PRODUCTION_PROJECT_REF`, then apply the migrations with `.github/workflows/release.yml`.
3. **Pause cron, and check it,** as in part C, step 2.
4. **Empty `public`,** as in part C, step 3.
5. **Load `public` and `auth`.** Run `pg_restore --data-only --schema=public --schema=auth`, then load the file as in part C, step 4, into the new project. `auth` holds the staff accounts; the sessions, tokens and factors were never in the backup.
6. **Check,** as in part C, step 5: row counts, chains and pgTAP.
7. **Give the staff back their authenticators.** After the restore no staff member has an authenticator, and every session is gone.
   1. Leave exactly one superadmin active: set the other staff inactive, through the privileged path that part E of the staging runbook uses.
   2. The project owner runs the break-glass reset for that superadmin (Security.md §5.2, "Sole superadmin lost their authenticator"). The superadmin signs in with their password and enrols a new TOTP.
   3. That superadmin reactivates each staff member with `set_staff_status`, then runs `reset_staff_mfa`, and gives each one a re-enrolment code (P4.8.05) in person or by voice.
8. **Reopen.** Resume the jobs, lift `maintenance_mode`, and point Vercel at the new project.

## Drill record

| Date | Backup (object) | Where (local / `gisikdrono-drill-<date>`, deleted on) | RPO (age of the dump) | RTO (B.1 to C.5) | pgTAP | Playwright | Commands changed | By |
|---|---|---|---|---|---|---|---|---|
| (first drill pending: needs production and part A) | | | | | | | | |

**PITR add-on.** Not yet decided: the owner decides with the Supabase Pro upgrade (Task P0.1.01). With it the RPO target is 1 hour; without it, 24 hours from the daily backups and 7 days from this weekly copy. Record the decision and its date here.
