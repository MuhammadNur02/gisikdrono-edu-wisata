# Runbook: backups and the restore drill

Owner: Dev on call, with the kelurahan's vault holder for the private key. Source of truth: `docs/Security.md` §7.8 (RES-01, DB-07), `docs/PRD.md` NFR-08 and §13.1 A27, `docs/Task.md` P5.5.04. The weekly job is `.github/workflows/backup.yml`; this page sets it up, restores from it, and records each drill.

**Targets.** RPO 24 hours (1 hour with the PITR add-on), RTO 4 hours for the database (NFR-08). Supabase Pro keeps daily backups for 7 days. The R2 copy is the off-site one, and the only one that outlives the Supabase account.

**What a backup holds.** One tar, `postgres/<time>.tar`, of two age files. Plain text is never written to the runner's disk.

| File | Content |
|---|---|
| `public.dump.age` | `pg_dump --format=custom --schema=public`: every booker's contact details and every other row of `public` |
| `auth-snapshot.json.age` | `internal.backup_auth_snapshot()`: every row of `auth.users`, `auth.identities`, `auth.sso_providers`, `auth.sso_domains` and `auth.saml_providers`, as JSON keyed by table |

`auth` never goes through `pg_dump` (fourth review of PR #98, H1 and H2). Supabase gives postgres USAGE on `auth` without the right to pass it on, so the backup role has none, and the snapshot reads those five tables for it. Visitors have no accounts, so the snapshot is a handful of staff rows. The rest of `auth` is never in a backup (review M1; delta review N6 and L3; third review D1):

- sessions, refresh and one-time tokens, and flow state;
- MFA factors, challenges and AMR claims, and WebAuthn;
- SAML relay states, and OAuth clients, consents, authorizations and custom providers;
- the Auth audit log;
- GoTrue's own `schema_migrations` and `instances`.

pgTAP `backup_reader.sql` fails on any `auth` table that is in neither list. A restore therefore signs every staff member out and leaves them without an authenticator (part E).

Every restore loads data after the migrations, so no definition is needed from a backup.

**Where a restore may go** (PRD §13.1 A27, owner-delegated 2026-10-28):
- the drill: a throwaway local stack on the vault holder's encrypted machine;
- the hosted rehearsal: a temporary project made for it and deleted afterwards. It is required once before go-live (Task P5.5.04), and optional after;
- a real production restore.

It never goes into `gisikdrono-staging`, which holds no real visitor data. It never goes into any project bound to Vercel.

## A. One-time setup (owner, at go-live)

1. **The age key pair.** On the vault holder's machine, run `age-keygen -o gisikdrono-backup.key`. The file holds the private key (`AGE-SECRET-KEY-1...`). Store it in the vault, never in the repository, GitHub or a chat. Its `# public key: age1...` line is `BACKUP_AGE_PUBLIC_KEY`. Delete the file once the vault holds it.
2. **The R2 bucket.** In Cloudflare R2, create a private bucket with no public access and no custom domain. Give it two rules on the prefix `postgres/`:
   - a lifecycle rule that deletes objects after 56 days (8 weeks, Security.md §7.8);
   - a bucket lock rule that keeps them for 56 days, so neither a leaked token nor a mistake can delete or overwrite a backup sooner (review of PR #98, L6).

   Create an R2 API token with **Object Read & Write** on that bucket only. Its access key id, secret and the account id are `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_ACCOUNT_ID`; the bucket name is `R2_BUCKET`.
3. **Supabase's root certificate.** In the `gisikdrono-prod` dashboard, open Database settings > SSL configuration > Download certificate. Commit the file as `supabase/certs/prod-ca-2021.crt`. It is public and identifies Supabase's CA, so every connection of the job checks the server (`PGSSLMODE=verify-full`) instead of merely encrypting. The job stops while the file is missing.
4. **The backup role.** The migration `20261104230000_backup_reader.sql` makes the group `backup_reader`. It has:
   - USAGE on `public`;
   - SELECT on every table and sequence of `public`, and on every later table postgres adds there;
   - execute on `internal.environment()` and `internal.backup_auth_snapshot()`.

   Nothing else. It has no USAGE on `auth` and no grant on any `auth` table, so it never reads a session, a token or a factor. It holds no `pg_read_all_data`, which would also open `cron`, `vault` and `net`. The snapshot function runs as postgres, only for a session whose login role may act as `backup_reader` (SET membership, which `in role backup_reader` gives; 20261105110100). That option exists from Postgres 16 on, so production must run 16 or later (Security.md §13.1, go-live #28): `select current_setting('server_version_num')::int >= 160000;` answers true. pgTAP `backup_reader.sql` proves that a session without it is refused, and that every table and sequence of `public` is readable to the role, so a new table cannot miss the dump.

   Create the login role that belongs to it in psql, connected to `gisikdrono-prod` as `postgres`. Never use the SQL editor for this, since a password typed there reaches the server and its logs in plain text (delta review L6). `\password` sends only the SCRAM verifier that psql computes on the vault holder's machine; type the password from the vault when it asks:

   ```sql
   create role gisikdrono_backup with login bypassrls in role backup_reader;
   \password gisikdrono_backup
   ```

   It needs `bypassrls`: every table of `public` forces RLS, and without it `pg_dump` either stops or dumps no rows. It needs nothing else.

   The job refuses the connection if any of these fail:
   - the role is `gisikdrono_backup`, and `backup_reader` is its only membership;
   - `backup_reader` belongs to no role;
   - the role is not a superuser, cannot create roles or databases, cannot replicate, and holds neither `pg_read_all_data` nor `pg_write_all_data`.

   CI's db job makes such a role on the local stack and runs the same `pg_dump` and snapshot as it, so a change that breaks either fails there first. If Supabase refuses the attribute or the grant, stop and record it here. Never dump as `postgres` instead.
5. **The connection string.** Use the session pooler: Connect > Session pooler, port 5432. Put the role and the ref in the user, `gisikdrono_backup.<ref>`, and leave out `sslmode` or set `sslmode=verify-full`. GitHub's runners have IPv4 only, and the direct host `db.<ref>.supabase.co` answers on IPv6 only. Check on the first run that the pooler's certificate verifies against the committed one; if it does not, stop and record it, never lower `PGSSLMODE`.
6. **Network restrictions.** Production's network restriction (DB-06) is deferred until a runner with a fixed egress address, or a self-hosted runner, exists (Task P5.8.02, Security.md DB-06). Until then the job reaches the database through the pooler with the role's own password and verified TLS.

   **Never add a world-open rule** (`0.0.0.0/0`, or `::/0`) to an allow-list to let a job through. Revisit the restriction when that runner exists.
7. **The GitHub environment `production-backup`.** Settings > Environments > New environment:
   - No required reviewers, so the Sunday run never waits.
   - Deployment branches: `main` only.
   - Secrets: `SUPABASE_DB_URL` (the string of step 5), `BACKUP_AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.

   No access token: the job checks the project without the Management API.
8. **The repository variables.** Settings > Secrets and variables > Actions > Variables:
   - `PRODUCTION_PROJECT_REF`: the 20-letter ref of `gisikdrono-prod`. The job refuses any URL of another project.
   - `PRODUCTION_BACKUP_ENABLED`: `true`, set at go-live and not before. Until then the job is skipped. From then on a missing secret fails the run.
9. **The first run.** Actions > Weekly database backup > Run workflow. Before it dumps, the job checks:
   - the URL's user (`gisikdrono_backup.<ref>`) and its ref against `PRODUCTION_PROJECT_REF`;
   - inside the database, the role and its powers;
   - the Vault marker (`internal.environment()` must answer `production`).

   The summary names the object, its size and its sha256. After go-live a failed run is an incident: rerun it, and open `docs/runbooks/cron.md` if it fails twice.
10. **A new table in `auth`.** A Supabase upgrade can add a table to `auth`. pgTAP `backup_reader.sql` then fails on the next pull request, since the table is in neither of its lists (third review of PR #98, L-b). Never grant the role anything by hand. Classify the table in a pull request:
    - **Its rows belong to a staff account:** add the table to `internal.backup_auth_snapshot()` in a new migration, and to pgTAP's copied list. `scripts/backup-auth-tables.test.mjs` keeps the two equal.
    - **Otherwise:** add it to pgTAP's never-backed-up list.

    Until that pull request merges, the snapshot leaves the new table out, so treat it as urgent if staff accounts depend on it.

The backup password, the R2 token and the age key pair are rotated as `docs/runbooks/rotate-keys.md` says.

## B. Fetch and decrypt a backup (vault holder's machine, never CI)

1. Find the object: `aws s3 ls s3://<bucket>/postgres/ --endpoint-url https://<account id>.r2.cloudflarestorage.com`. Use a read-only R2 token of your own, never the job's.
2. Download it. Compare its `sha256sum` with the object's `sha256` metadata (`aws s3api head-object ...`) and with the job summary.
3. Unpack it: `tar --extract --file <object>.tar`. That gives `public.dump.age` and `auth-snapshot.json.age`, both still encrypted.
4. Decrypt onto the machine's encrypted disk:

   ```bash
   age --decrypt -i <private key file> -o public.dump public.dump.age
   age --decrypt -i <private key file> -o auth-snapshot.json auth-snapshot.json.age
   ```

   The plain files never leave that disk. Delete them when the drill or the restore ends (part D).
5. Check that both read: `pg_restore --list public.dump > /dev/null`, and `jq 'keys' auth-snapshot.json` lists the five tables.

## C. The quarterly drill (local stack, vault holder's machine)

The drill restores production data onto the vault holder's own machine and nowhere else. Its stack has no Vercel deployment, no messaging keys and no network exposure.

1. **A checkout and a stack of its own.**
   - Make a separate checkout of `main` for the drill: `git worktree add ../gisikdrono-drill main`.
   - In that checkout only, set `project_id = "gisikdrono-drill"` in `supabase/config.toml`, and never commit it. Its containers and volumes are then the drill's own, apart from any development stack (delta review L5).
   - Run `supabase start`, then `supabase db reset`. That applies every migration and the reference seed. Do not run `pnpm db:seed`: the drill needs no development accounts.
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

4. **Load `public`, never `auth`.** The snapshot is loaded only in a real production restore (part E). `profiles` loads without its `auth.users` rows because the triggers, foreign keys included, are off.

   ```bash
   pg_restore --data-only --schema=public --file=data.sql public.dump
   psql "$LOCAL_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
     -c 'set session_replication_role = replica' -f data.sql
   ```

   `LOCAL_DB_URL` is the drill stack's own database address, the `DB URL` line of `supabase status`.

   The audit and hash chains keep production's values, since no trigger writes new ones. Storage objects are not in the dump: `public-media` has its own monthly mirror (Security.md §7.8), and `documents` are rendered again from their rows.
5. **Check.**
   - **Row counts.** Count `bookings`, `payments`, `tickets_qr`, `revenue_share_entries`, `audit_logs` and `profiles` on production (the SQL editor), and on the drill stack: they read the same.
   - **The chains.** `select internal.verify_ledger_chain(), internal.verify_audit_chain();` as `postgres`: both pass.
   - **The sequences.** The data-only load writes identity values as they were (`COPY` takes them, `generated always` columns included), and the dump's `SEQUENCE SET` entries put each sequence of `public` back where production had it. The block below warns of any sequence of `public` or `auth` that stands behind the highest value of its column; it must print nothing, or the next insert into that table fails on its key. Fix a warned one with `select setval('<sequence>', <highest>);` and record it below.

     ```sql
     do $$
     declare
       col record;
       highest bigint;
       reached bigint;
     begin
       for col in
         select c.table_schema, c.table_name, c.column_name,
                pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) as seq
         from information_schema.columns c
         where c.table_schema in ('public', 'auth')
           and pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) is not null
       loop
         execute format('select max(%I) from %I.%I', col.column_name, col.table_schema, col.table_name) into highest;
         execute format('select case when is_called then last_value else last_value - 1 end from %s', col.seq)
           into reached;
         if highest > reached then
           raise warning '%.%.%: sequence % stands at %, behind the highest value %',
             col.table_schema, col.table_name, col.column_name, col.seq, reached, highest;
         end if;
       end loop;
     end;
     $$;
     ```
   - **pgTAP.** `pnpm db:test`. Each suite rolls back its own rows. Record a failure that comes from production's data rather than the restore in the table below; never fix it in the drill.
   - **Playwright.** `pnpm e2e` against the same stack. The suites create their own accounts and rows, so a pass means the app runs on production's data. No message leaves the machine: local runs deliver to Mailpit or nowhere.
6. **Note the times.**
   - **RTO:** from step B.1 to the end of step C.5.
   - **RPO:** the age of the dump, from the object's name to the moment the drill started.

### The hosted rehearsal (once before go-live, optional after)

Before go-live, run it once against the first real backup, so part E has been done on Supabase itself before it is ever needed. After that, run it once a year, or whenever a real restore looks likely.

1. **Make a project for this rehearsal only.** Name it `gisikdrono-drill-<YYYY-MM-DD>`, in `ap-southeast-1`, with no Vercel binding. In its network restrictions, allow the vault holder's IP alone.
2. **Migrate it from the vault holder's machine** (delta review L4). No GitHub environment, secret or variable changes for a rehearsal, and the release workflow is not used. From the drill checkout, run `supabase link --project-ref <the rehearsal's ref>`, then `supabase db push --linked`, then `supabase unlink`.
3. **Pause cron, then set its Vault secrets,** as part E steps 3 and 4 do, but with `environment` = `drill` and `jobs_base_url` = `https://example.invalid`. `drill` is outside the allow-list, so `internal.environment()` reads it as unrecognised: the rehearsal never counts as production, staging or local.
4. **Restore.** Follow part E steps 5 to 8 against it, without lifting `maintenance_mode` and without pointing anything at it.
5. **Delete it the same day.** Delete the project, and with it its backups. Record the deletion and its date in the table below.

## D. After the drill

1. **Remove the local copy.** Run `supabase stop --no-backup` in the drill checkout, so no volume keeps production rows.
2. **Delete what the run left.** Delete `test-results/`, `playwright-report/` and any Playwright trace of the drill checkout, since they hold production rows on screen. Then remove the checkout: `git worktree remove ../gisikdrono-drill`.
3. **Delete the files.** Delete `public.dump`, `auth-snapshot.json`, the two `.age` files, `data.sql` and the downloaded object from the vault holder's machine.
4. **Record the drill** below, and in the quarterly review minutes (Security.md §13.2).

## E. A real restore of production

Use this when Supabase's own daily backups (or PITR) cannot help: the project or the account is lost, or every daily backup is too late. If the loss came from an attack, open `docs/runbooks/breach.md` first.

1. **Close the site.** Put it in `maintenance_mode` on whatever still answers, and tell the kelurahan office.
2. **Create the new project and migrate it.** Create the project in `ap-southeast-1`, named `gisikdrono-prod`. Update the environment's secrets and `PRODUCTION_PROJECT_REF`, then apply the migrations with `.github/workflows/release.yml`.
3. **Pause cron, and check it,** as in part C, step 2, as soon as the migrations are in. The migrations schedule every job, so they start the minute the release ends; pausing them before the Vault holds anything means no job ever runs with production's address and `CRON_SECRET` against a database that is still being emptied and loaded (follow-up of the review of PR #98: this step used to come after the Vault).
4. **Recreate the Vault secrets** while cron is paused (delta review L8). These are the four of `docs/runbooks/staging-setup.md` D.1, with production's values from the vault:

   | Secret | Value |
   |---|---|
   | `environment` | `production` |
   | `jobs_base_url` | production's address |
   | `cron_secret` | the `CRON_SECRET` value |
   | `otp_pepper` | the `OTP_PEPPER` value |

   The dump never holds the Vault, and `internal.call_job` needs all four before the jobs resume in step 10.
5. **Empty `public` and `auth`.** Empty `public` as in part C, step 3. In the same session, empty every table of the new project's `auth` except `schema_migrations` and `instances` (delta review N6), the same way with `auth.%I`. Those two are the new Auth server's own bookkeeping, which no backup holds, so the new project keeps its own.
6. **Load `public` and the staff accounts.**
   - Load `public` from `public.dump` as in part C, step 4.
   - Then, in psql as `postgres` with the triggers still off, load the snapshot. A newer Auth server may have added or dropped columns since the backup, so each table writes only the columns both sides have (follow-up of the review of PR #98):
     - a column of the new project that the backup does not name keeps the new project's default, never a null;
     - a column the backup names that the new project lacks is left out, and the block names it in a notice;
     - an identity or serial column keeps the backup's value, since rows elsewhere may point at it: the insert says `overriding system value`, so a `generated always` identity column takes it too, and afterwards every sequence behind such a column is moved past the highest value loaded, so the next row Auth writes does not collide (follow-up of the review of PR #107). The five tables key their rows by uuid today, so this matters only once a newer Auth adds such a column;
     - a generated (computed) column is left to Postgres.

   ```sql
   \set snapshot `cat auth-snapshot.json`
   select set_config('restore.snapshot', :'snapshot', false);
   set session_replication_role = replica;
   do $$
   declare
     snapshot jsonb := current_setting('restore.snapshot')::jsonb;
     t text;
     columns text;
     left_out text;
     serial record;
   begin
     foreach t in array array['users', 'identities', 'sso_providers', 'sso_domains', 'saml_providers'] loop
       select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into columns
       from information_schema.columns c
       where c.table_schema = 'auth' and c.table_name = t and c.is_generated = 'NEVER'
         and exists (select 1 from jsonb_array_elements(snapshot -> t) r where r ? c.column_name);
       select string_agg(distinct k, ', ') into left_out
       from jsonb_array_elements(snapshot -> t) r cross join lateral jsonb_object_keys(r) k
       where not exists (select 1 from information_schema.columns c
                         where c.table_schema = 'auth' and c.table_name = t and c.column_name = k);
       if left_out is not null then
         raise notice 'auth.%: the backup''s columns % are not in this project and were left out', t, left_out;
       end if;
       if columns is not null then
         execute format('insert into auth.%I (%s) overriding system value '
                        'select %s from jsonb_populate_recordset(null::auth.%I, $1 -> %L)',
                        t, columns, columns, t, t) using snapshot;
       end if;
       for serial in
         select c.column_name, pg_get_serial_sequence(format('auth.%I', t), c.column_name) as seq
         from information_schema.columns c
         where c.table_schema = 'auth' and c.table_name = t
           and pg_get_serial_sequence(format('auth.%I', t), c.column_name) is not null
       loop
         execute format('select setval(%L, coalesce((select max(%I) from auth.%I), 0) + 1, false)',
                        serial.seq, serial.column_name, t);
       end loop;
     end loop;
   end;
   $$;
   ```

     The block reads the file's content through `restore.snapshot`, and loads `users` before the tables that point at them. A table with no rows in the backup loads nothing. Read every notice before going on: a column left out of `users` or `identities` may be one a staff account needs, so record it below and check it with step 8.
7. **Clear the tokens on the staff accounts** (delta review L3). The backup keeps `auth.users` whole, including tokens a mail or a phone change had sent:

   ```sql
   update auth.users set confirmation_token = '', recovery_token = '', email_change_token_new = '',
     email_change_token_current = '', phone_change_token = '', reauthentication_token = '';
   ```

8. **Check,** as in part C, step 5: row counts, chains and pgTAP.
9. **Give the staff back their authenticators.** After the restore no staff member has an authenticator, and every session is gone.
   1. Leave exactly one superadmin active: set the other staff inactive, through the privileged path that part E of the staging runbook uses.
   2. The project owner runs the break-glass reset for that superadmin (Security.md §5.2, "Sole superadmin lost their authenticator"). The superadmin signs in with their password and enrols a new TOTP.
   3. That superadmin reactivates each staff member with `set_staff_status`, then runs `reset_staff_mfa`, and gives each one a re-enrolment code (P4.8.05) in person or by voice.
10. **Reopen.** Create the backup role again (part A, step 4), resume the jobs, lift `maintenance_mode`, and point Vercel at the new project.

## Drill record

| Date | Backup (object) | Where (local / `gisikdrono-drill-<date>`, deleted on) | RPO (age of the dump) | RTO (B.1 to C.5) | pgTAP | Playwright | Commands changed | By |
|---|---|---|---|---|---|---|---|---|
| (first drill and the pre-go-live hosted rehearsal pending: they need production and part A) | | | | | | | | |

**PITR add-on.** Not yet decided: the owner decides with the Supabase Pro upgrade (Task P0.1.01). With it the RPO target is 1 hour; without it, 24 hours from the daily backups and 7 days from this weekly copy. Record the decision and its date here.
