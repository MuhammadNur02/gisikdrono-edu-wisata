# Runbook: putting production online (pre-launch, then launch)

Owner: the repository owner (accounts and secrets) with the Dev on call. Source of truth: `CLAUDE.md` §6.5, §7.7 and §10.2, `src/lib/env.ts`, `src/lib/public-env.ts`, `src/config/launch.ts`, `docs/Security.md` §3.9, §8.9 and §13.1, `docs/Task.md` P5.7, `docs/runbooks/release-checklist.md` ("The production release job"), and `docs/runbooks/staging-setup.md`, which this guide follows step for step where production does the same.

The platform goes public in two phases (decision of 2026-10-29):

| Phase | What visitors get | Plans | Keys |
|---|---|---|---|
| **Part 1: pre-launch** | The public pages on the real domain (home, RW pages, packages, products, gallery, e-booklet, articles, reviews, map and contact, privacy, the verification pages). Staff sign in to the dashboard to manage content. **Booking and payment are closed** and say "Pemesanan segera dibuka" | Vercel **Hobby**, Supabase **Free** | No Midtrans, no WhatsApp |
| **Part 2: launch** | Booking and payment open | Vercel **Pro**, Supabase **Pro** | Midtrans production, WhatsApp, the full go-live checklist |

Pre-launch is one build-time switch, `NEXT_PUBLIC_FLAG_PRELAUNCH=on`, set for Vercel's **Production** environment only. While it is on, the code itself keeps booking, OTP codes, the walk-in counter and every payment closed, whatever the database says; the Midtrans webhook answers 404; the jobs that only ask Midtrans skip their run and still report healthy. What it relaxes and what it does not is listed in `docs/Security.md` §8.9. Removing it later needs a rebuild, and that rebuild refuses to start until every Midtrans and WhatsApp credential is in place, so a launched site can never run half-configured.

Throughout this guide `<domain>` means the kelurahan's domain without `https://` (decision A11), `<prod-ref>` the 20-letter ref of the production Supabase project, and `<site>` means `https://<domain>`. Never write the real values into the repository, an issue, a pull request or a chat: **the repository is public**. The rules of staging-setup.md "Before you start" apply here too: Bitwarden for every secret, an authenticator app, your local clone up to date (`git pull`, `pnpm install`), Node 22.

---

## Part 1: Pre-launch on free plans

| Step | What you do | You need from before |
|---|---|---|
| 1 | Supabase production project and its settings | nothing |
| 2 | GitHub environment `production`; migrate with `release.yml` | 1 |
| 3 | No demo content | 2 |
| 4 | First superadmin | 2, and 1.4 (Auth settings) |
| 5 | Vercel production project and its variables | 1 |
| 6 | Domain and DNS | 5 |
| 7 | Scheduled jobs | 2, 6 |
| 8 | Database switches and settings | 4 |
| 9 | Verify | all |

### 1. The Supabase production project

#### 1.1 The organisation and the project

1. Sign in to https://supabase.com with the **institutional email**, never the dedicated staging account (Task P0.1.01): nothing the staging account or its tokens can reach may touch production. Add your authenticator app under **Account preferences** > **Multi-factor authentication** and keep the recovery codes in Bitwarden (collection Supabase).
2. Create a new organisation `Kelurahan Gisikdrono Produksi` (any clear name, distinct from staging's), plan **Free**. A Free organisation may hold two active projects; production gets one of its own.
3. **New project**:
   - Name: `gisikdrono-prod`, exactly. `.github/workflows/release.yml` refuses any project with another name.
   - Database password: **Generate a password**, save it in Bitwarden as `Supabase gisikdrono-prod database password`.
   - Region: **Southeast Asia (Singapore)**, `ap-southeast-1`.
   - Keep **Data API + Connection String** and **Use public schema for Data API**; leave automatic RLS on new tables off (the migrations enable and force RLS themselves).
4. Wait for **Healthy**. **Project Settings** > **General** > **Project ID** is `<prod-ref>`; keep it in Bitwarden next to the password.
5. Check the Postgres version in **SQL Editor** (`docs/runbooks/release-checklist.md`, go-live #28):

   ```sql
   select current_setting('server_version_num')::int >= 160000 as ok, version();
   ```

   It must say `ok = true`.

#### 1.2 Vault secrets, before the first migration

As staging-setup.md D.1, with the production values. **Integrations** > **Vault** > **Add new secret**, four times, names in lower case:

| Name | Value |
|---|---|
| `environment` | `production` |
| `jobs_base_url` | `<site>` (starts with `https://`, no slash at the end) |
| `cron_secret` | the `CRON_SECRET` of step 5.1 |
| `otp_pepper` | the `OTP_PEPPER` of step 5.1 |

So generate the secrets file of step 5.1 first, then come back here. Check with `select name from vault.secrets order by name;` (names only). Never set `environment` to anything but `production` here.

#### 1.3 Cloudflare Turnstile widget

Production refuses Cloudflare's test keys, so it needs its own widget: https://dash.cloudflare.com > **Turnstile** > **Add widget**, name `gisikdrono-production`, hostnames `<domain>` and `www.<domain>`, mode **Managed**, pre-clearance **No**. Keep the page open for step 5.1. Do not reuse the staging widget.

#### 1.4 Auth and API settings

Mirror `supabase/config.toml` by hand, as staging-setup.md D.6 does, with these production values. Take a screenshot of each screen for the vault (go-live #20).

| Where (Supabase dashboard) | Setting | Value |
|---|---|---|
| Authentication > Sign In / Providers | Allow new users to sign up | **off** (invite-only, AUTH-01) |
| | Email provider | on; Confirm email **on**; Secure email change **on** |
| | Email OTP | length 8, expiry 600 seconds |
| | Phone, anonymous, every OAuth provider | off |
| | Minimum password length / requirements | 8; lowercase, uppercase, digits and symbols |
| Authentication > Attack Protection | Captcha protection | **on**, Cloudflare Turnstile, secret = the production `TURNSTILE_SECRET_KEY` |
| | Leaked password protection | not offered on Free; turn on at launch (part 2) |
| Authentication > URL Configuration | Site URL | `<site>` |
| | Redirect URLs | exactly one: `<site>/auth/callback` |
| Authentication > Sessions | Refresh token rotation | on, reuse interval 10 seconds |
| | Time-box 12 hours / inactivity timeout 2 hours | not offered on Free; turn on at launch (part 2) |
| Authentication > Sessions, or Project Settings > JWT Keys | Access token (JWT) expiry | 900 seconds |
| Authentication > Multi-Factor | TOTP | enroll and verify **on**; Phone MFA off; maximum factors per user 1 |
| Authentication > Auth Hooks | Customize Access Token (JWT) Claims | **on**, Postgres, schema `public`, function `custom_access_token_hook` (only after step 2 has created it) |
| | Password Verification Attempt, MFA Verification Attempt | **leave off** (`docs/Security.md` §5.5) |
| Authentication > Rate Limits | Sign-ups and sign-ins | 10 per 5 minutes per IP |
| | Token verifications | 30 per 5 minutes |
| Authentication > Emails > Templates > Invite user | Subject and body | the subject of `[auth.email.template.invite]` in `supabase/config.toml` and the HTML of `supabase/templates/invite.html`, pasted as they are |
| Authentication > Emails > Templates > Reset Password | Subject and body | the subject of `[auth.email.template.recovery]` and the HTML of `supabase/templates/recovery.html` |
| Authentication > SMTP Settings | Custom SMTP | **on**: host `smtp.resend.com`, port `465`, user `resend`, password = the **production** `RESEND_API_KEY` of step 5.1, sender = the address of `EMAIL_FROM` on `mail.<domain>` (Task P0.1.16) |
| Project Settings > Data API | Exposed schemas | `public` only (remove `graphql_public`) |
| | Max rows | 100 |
| Database > Settings | Enforce SSL on incoming connections | on |

The Resend key for production is **its own key**, created in Resend (**API Keys** > **Create API key**, name `gisikdrono-production`, permission **Sending access**, domain `mail.<domain>`). Never reuse the staging placeholder or a staging key. After the SMTP settings are saved, send yourself a password reset from `<site>/forgot-password` once step 6 is done and check it arrives DKIM-signed.

### 2. Migrate with `.github/workflows/release.yml`

Production's schema comes only from this workflow (`CLAUDE.md` §6.4, §12.1 no. 19). Read "The production release job" in `docs/runbooks/release-checklist.md` before the first run; in short:

1. **One-time setup.** GitHub > **Settings** > **Environments** > **New environment** `production`:
   - **Deployment branches and tags**: selected branches, `main` only.
   - **Required reviewers**: you (and a second maintainer once there is one). **Prevent self-review** on as soon as a second reviewer exists; with one owner the run waits for your own approval.
   - **Environment secrets**: `SUPABASE_ACCESS_TOKEN`, a personal access token of the institutional Supabase account (https://supabase.com/dashboard/account/tokens, name `github-production-release`, the shortest expiry, put the date in your calendar), and `SUPABASE_DB_URL`, the **session pooler** string of `gisikdrono-prod` (project > **Connect** > **Session pooler**, port 5432, user `postgres.<prod-ref>`, with the database password filled in, no `sslmode` or `sslmode=verify-full`). The direct `db.<prod-ref>.supabase.co` address is IPv6 only and cannot work from GitHub.
2. **Dry run.** **Actions** > **Production release** > **Run workflow**, branch `main`. The only input is **dry_run**, ticked by default. Approve the run when GitHub asks. It checks that the URL belongs to a project named `gisikdrono-prod`, runs the read-only pre-flight (`scripts/release-preflight.sql`) and the Security Advisor (errors stop the run), then lists every migration from `0001_extensions.sql` to the newest under **Migrations that would run**. It changes nothing.
3. **Apply.** Run it again with **dry_run** unticked and approve. It applies the migrations with `supabase db push --linked` (never `--include-all`, never `--include-seed`) and runs the Advisor again. Note the commit SHA of the run (top of the run page); step 5.4 deploys exactly that commit.
4. If it fails before the push, nothing changed: fix the cause and run again. If the Advisor fails after the push, follow "If a check fails after the push" in the release checklist: do not deploy, fix forward with a new migration.

Then turn on the **Customize Access Token** hook of 1.4, which needs the function the migrations created.

### 3. No demo content on production

- `release.yml` has no demo input and never writes seed data. The demo content of `scripts/seed-demo-content.sql` and the **seed_demo** box belong to the **Staging release** workflow and the staging project only; that file also refuses a database whose Vault `environment` is `production`.
- Never run `pnpm db:seed`, `pnpm db:seed:staging-media`, `scripts/seed-dev.sql`, `supabase db reset --linked` or `supabase db push --include-seed` against production, and never paste any of those files into its SQL editor.
- The real content (RW profiles, packages, products, photos, articles, the e-booklet) is entered by staff in the dashboard after step 4. The migrations bring only reference data: the RW units, `site_settings` and the default revenue rules.

### 4. The first superadmin

As staging-setup.md part E, on the production project, once step 2 has run and the access token hook of 1.4 is on:

1. Supabase > **Authentication** > **Users** > **Add user** > **Create new user**: your institutional mailbox, a new Bitwarden-generated password of at least 20 characters (login item `gisikdrono production superadmin`), **Auto Confirm User** ticked.
2. **SQL Editor**, role `postgres`, your address in place of the example:

   ```sql
   begin;
   select set_config('app.privileged_rpc', 'on', true);
   update public.profiles p
   set full_name = 'Superadmin Kelurahan', role = 'superadmin', is_active = true
   from auth.users u
   where u.id = p.id and u.email = 'your.name@institution.example';
   commit;

   select email, role, is_active, mfa_required from public.profiles;
   ```

   One row: `superadmin`, `true`, `true`. The role also stamps `became_staff_at`, which the release pre-flight checks.
3. After step 6, open `<site>/login` in a private window, sign in, enrol TOTP at **/mfa/enroll** and save the setup key in the Bitwarden item's **Authenticator key (TOTP)** field. Sign out and in again to see **/mfa/verify**.
4. The RW admins come later by invite from **/dashboard/users** (Task P4.8), each enrolling their own TOTP.

### 5. The Vercel production project and its variables

#### 5.1 Generate the production secrets

The random values are **new for production**, drawn on your machine; never copy one from staging or from the staging secrets note. In PowerShell:

```powershell
cd $env:USERPROFILE\gisikdrono-edu-wisata
git pull
node scripts/generate-production-secrets.mjs
notepad $env:USERPROFILE\gisikdrono-production-secrets.txt
```

The script writes `%USERPROFILE%\gisikdrono-production-secrets.txt` outside the repository, prints only its path, refuses a path inside the repository and never overwrites an existing file. Each value is 32 random bytes from Node's `crypto.randomBytes` (hex, or base64 for the QR key, kid `k1`). Fill in every empty line from the production dashboards. This is the complete pre-launch list, 21 variables:

| Variable | Side | Value comes from |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | P | `<site>`, no slash at the end |
| `NEXT_PUBLIC_SUPABASE_URL` | P | Supabase `gisikdrono-prod` > Project Settings > Data API > Project URL (`https://<prod-ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | P | Supabase > API Keys > Legacy API keys > `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | S | Supabase > API Keys > Legacy API keys > `service_role` (the most sensitive value) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | P, S | the production widget of 1.3 |
| `RESEND_API_KEY` | S | the production Resend key of 1.4 |
| `EMAIL_FROM` | S | for example `Edu Wisata Gisikdrono <noreply@mail.<domain>>` |
| `NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER` | P | the kelurahan's official number as `+628…`; production refuses the sample `+6281200000000` |
| `SECURITY_ALERT_EMAIL`, `SECURITY_ALERT_WA_PHONE` | S | the operator's mailbox and phone for production alerts |
| `MIDTRANS_WEBHOOK_PATH_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `QR_SIGNING_KEYS`, `QR_SIGNING_ACTIVE_KID`, `BOOKING_LINK_SECRET`, `OTP_PEPPER`, `CRON_SECRET` | S | generated by the script |
| `MIDTRANS_IS_PRODUCTION` | S | fixed `true` (already filled) |
| `NEXT_PUBLIC_FLAG_PRELAUNCH` | P | fixed `on` (already filled) |
| `NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS` | P | fixed `off` (already filled; Supabase Free has no image transformer) |

**Left unset in pre-launch** (the file has no line for them, add none to Vercel): `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID`, `MIDTRANS_SERVER_KEY_PREVIOUS`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `RESEND_WEBHOOK_SECRET`, `PARTICIPANT_PII_KEYS`, `PARTICIPANT_PII_ACTIVE_KID`, `NEXT_PUBLIC_SENTRY_DSN`. `VERCEL_ENV` is set by Vercel; never add it. The CI-only names (`SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `BACKUP_AGE_PUBLIC_KEY`, `R2_*`, `SENTRY_AUTH_TOKEN`) live in GitHub environments, never in Vercel.

`QR_SIGNING_ACTIVE_KID` is `k1`, which the migrations seed in `site_settings` `qr.signing_kids`; step 8 checks it.

#### 5.2 The project

Production gets its own Vercel project under its own account, never the staging account's project (Task P0.1.03).

1. Sign up at https://vercel.com with the **institutional email**, plan **Hobby** for now, MFA on (**Account Settings** > **Authentication**), recovery codes in Bitwarden. Hobby is for personal, non-commercial use: acceptable only while the site takes no payment; part 2 moves to a Pro team before booking opens.
2. **Add New** > **Project** > import `MuhammadNur02/gisikdrono-edu-wisata` (give the Vercel GitHub app access to this repository only). Name `gisikdrono-production`, framework Next.js, root `./`. Add **no** variables on this screen. **Deploy**: this first build fails, which is expected (no variables yet).
3. **Settings** > **Build and Deployment**: **Node.js Version** `22.x`. **Ignored Build Step**: **Custom**, exactly:

   ```bash
   [ "$VERCEL_GIT_COMMIT_REF" != "production" ] || [ "$VERCEL_GIT_REPO_OWNER" != "MuhammadNur02" ] || [ -n "$VERCEL_GIT_PULL_REQUEST_ID" ]
   ```

   It builds only the branch `production` of this repository, never a pull request or a fork.
4. **Settings** > **Environments** > **Production** > **Branch Tracking**: branch `production`. `vercel.json` lets Vercel deploy only the `staging` and `production` branches, so a merge to `main` deploys nothing by itself: production moves only when you move its branch after a migration (5.4), which keeps "migrate first, then deploy".
5. **Settings** > **Security** (or **Git**): **Git Fork Protection** on. **Settings** > **Deployment Protection**: Vercel Authentication on, **Standard Protection** (previews behind a login; the production domain stays public). No Deployment Protection Exception here.
6. GitHub > **Settings** > **Rules** > **Rulesets** > **New branch ruleset** `production`, target branch `production`: **Restrict updates** with only you allowed to bypass, **Block force pushes**, **Restrict deletions**. Only the owner moves production.

#### 5.3 Put the values into Vercel

1. **Settings** > **Environment Variables** > **Add Environment Variable**. **Environments**: tick **Production** only; untick Preview and Development. **Sensitive** on.
2. Paste the whole filled-in file into the first **Key** field; Vercel splits it into one row per variable and skips comments. Check: 21 variables, all scoped to **Production** only.
3. Bitwarden (collection Vercel): a Secure Note `gisikdrono production environment <date>` with the whole file. Then go back to 1.2 for the Vault values, and delete the file:

   ```powershell
   Remove-Item "$env:USERPROFILE\gisikdrono-production-secrets.txt"
   ```

#### 5.4 The first production deployment

After step 2 applied the migrations, move the `production` branch to the commit that run used (`<sha>`, from the run page):

```powershell
git fetch origin
git push origin <sha>:refs/heads/production
```

Git refuses anything that is not a fast-forward, which is what you want. Vercel > **Deployments** shows a **Production** build of `production`; wait for **Ready**. A build that fails names the missing or malformed variable (`src/lib/env.ts`); fix it in Vercel and **Redeploy**. Every later release is the same: **Production release** run (dry run, then apply), then this push.

### 6. The domain

1. Vercel > the project > **Settings** > **Domains** > **Add Domain**: `<domain>`. Accept the suggestion to add `www.<domain>` too, and choose which one redirects to the other (recommended: `www.<domain>` redirects to `<domain>`, matching `NEXT_PUBLIC_SITE_URL`). Both are on **Production**.
2. Vercel then shows the DNS records to create. At your registrar's DNS page, create **exactly the records Vercel shows** for this project. At the time of writing they look like an `A` record for the apex (`@`) and a `CNAME` for `www` pointing at a `vercel-dns` host, but the values differ per project, so copy them from Vercel, not from here.
   - Remove any older `A`, `AAAA` or `CNAME` record for `@` or `www` that points elsewhere (a parking page, an old host).
   - If the zone has `CAA` records, one must allow Vercel's certificate authority (Vercel's domain page says so when it is missing).
   - **Leave every record of `mail.<domain>` untouched**: the Resend records (MX and SPF `TXT` on `send.mail` or `mail`, the DKIM `TXT` `resend._domainkey.mail`, `_dmarc`) keep sending working. Do not change the root domain's DMARC either.
3. Wait until Vercel shows both domains **Valid Configuration** and issues the certificate (minutes, sometimes a few hours for DNS to spread).
4. Cloudflare Turnstile: the widget of 1.3 lists both hostnames. Supabase URL Configuration (1.4) already names `<site>`.
5. HSTS `preload` is **not** added now; that comes after a clean week on the final domain (Task P5.7.04).

### 7. Scheduled jobs

Nothing needs pausing. The migrations schedule every job with pg_cron, and each application job now has its route:

- `payments-poll` and `reconcile-payments` check their `CRON_SECRET`, see the pre-launch flag, skip the run and record a success, so their heartbeat stays fresh and `/api/health` stays 200.
- `process-notifications` delivers email and the security alerts; it sends no WhatsApp message (step 8 turns the channel off, and the worker claims nothing while it is on).
- `anomaly-scan`, `purge-storage` and the database jobs run as usual.

Do **not** pause the two Midtrans jobs the way staging-setup.md D.5 once did: a paused job stops its heartbeat and `/api/health` reports it stalled. After 15 minutes, check (step 9, check 11).

### 8. Database switches and settings

The migrations leave `booking_enabled` **on** (`20261104080300_booking_open.sql`) and `whatsapp_enabled` on. The code keeps both closed in pre-launch anyway; the database switches are the second layer, and `/api/health` answers 503 while either is still on. **SQL Editor**:

```sql
update public.site_settings set value = to_jsonb(false)
where key in ('booking_enabled', 'whatsapp_enabled');

select key, value from public.site_settings
where key in ('booking_enabled', 'whatsapp_enabled', 'email_enabled', 'maintenance_mode', 'qr.signing_kids')
order by key;
```

It must show `booking_enabled` `false`, `whatsapp_enabled` `false`, `email_enabled` `true`, `maintenance_mode` `false` and `qr.signing_kids` containing `"k1"`.

Then, signed in as the superadmin, open **/dashboard/settings** and replace every value still holding its seeded placeholder (contact email and number, the kelurahan address, the signatory, the data protection officer, the expected payout account). Production's `/api/health` answers 503 while any is left. To list them in the SQL editor:

```sql
select * from internal.placeholder_site_settings();
```

It must return no row.

### 9. Verify

In PowerShell, set the address once:

```powershell
$u = "https://<domain>"
```

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Health | `curl.exe -s -w " %{http_code}" "$u/api/health"` | `{"status":"ok"} 200`. A 503 means a job is stalled, a placeholder or a pre-launch switch is left, or the QR kid is unknown: the server log in Vercel names which check (`health_degraded`) |
| 2 | Public pages | open `$u/`, `/rw-05-ecowastreme`, `/rw-13-kampung-budaya-seni`, `/rw-08-inklusif-ramah-anak`, `/paket-wisata`, `/produk`, `/galeri`, `/e-booklet`, `/artikel`, `/ulasan`, `/peta-kontak`, `/privasi` | each loads; empty lists show their empty states until staff add content |
| 3 | Booking closed | open a package page, then `$u/pesan/<package-slug>` | the package page shows **Pemesanan segera dibuka** instead of the booking buttons; the wizard shows the same notice |
| 4 | Pay page closed | open `$u/reservasi/GSK-AAAAAAAA/bayar` | the "Pemesanan segera dibuka" notice, no form |
| 5 | Midtrans webhook | `curl.exe -s -o NUL -w "%{http_code}" -X POST "$u/api/webhooks/midtrans/anything"` | `404` |
| 6 | Jobs refuse strangers | `curl.exe -s -o NUL -w "%{http_code}" -X POST "$u/api/jobs/payments-poll"` | `401` |
| 7 | Security headers | `curl.exe -sI "$u/"` | `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy`, `cross-origin-opener-policy: same-origin`, `permissions-policy`, and an **enforced** `content-security-policy` (not report-only); no `x-robots-tag: noindex` on public pages |
| 8 | Private pages | `curl.exe -sI "$u/login"` | `cache-control: private, no-store` and a CSP with a `nonce-` |
| 9 | Search engines | `curl.exe -s "$u/robots.txt"` | disallows `/dashboard`, `/api`, `/pesan`, `/reservasi`, `/login`, `/v`, and names the sitemap |
| 10 | Staff login | `curl.exe -sI "$u/dashboard"`, then sign in as in step 4.3 | `307` to `/login?next=…`; sign-in asks for the TOTP code and lands on `/dashboard` |
| 11 | Scheduled jobs | SQL editor: `select job, last_success_at, last_failure_at, last_error_code from public.job_heartbeats order by job;` | after 15 minutes the five-minute and one-minute jobs show a recent `last_success_at`, `payments-poll` included; no `secret_missing` or `insecure_base_url` (those mean 1.2 is wrong) |
| 12 | Email | `$u/forgot-password` with your own address | the reset email arrives from `mail.<domain>`, DKIM-signed |
| 13 | Photos without the transformer | right-click an uploaded photo > **Copy image address** | contains `/storage/v1/object/public/public-media/`, never `/render/image/` |

Then point the uptime monitor (Task P0.1.12) at `$u/api/health`, every 5 minutes, alerting on anything but 200.

### When Supabase pauses a Free project

Supabase pauses a Free project after a period of low activity; when this was written its documentation said **7 days** without sufficient database activity, that the owner gets a warning email beforehand and a notice when it happens, and that a paused project can be restored from the dashboard for a limited time (the documentation has given different limits over time; check the current page, "Project Pausing" in the Supabase docs). Supabase does not promise which kinds of traffic count as activity, so do not rely on the public pages or the database's own scheduled jobs to keep it awake: Vercel serves most public pages from its cache, without asking the database.

What a pause means for pre-launch production:

- The dashboard login, every page Vercel has not cached, the uploads, `/api/health` (it answers `down`, so the uptime monitor alerts) and every scheduled job stop. Cached public pages may keep showing for a while.
- To resume: Supabase > the project > **Resume project** (or **Restore**), wait for **Healthy**, then run checks 1 and 11. Data, Vault secrets, Auth settings and the schedules come back as they were.
- Resume at once when the warning or the uptime alert arrives; never leave production paused. A Free project has **no daily backups**, so set up the weekly encrypted backup of `docs/runbooks/restore-drills.md` part A as soon as you can, and keep staff signing in every few days.
- A Pro project is never paused for inactivity (part 2).

### What not to do in pre-launch

1. Never remove `NEXT_PUBLIC_FLAG_PRELAUNCH` or set it to `off` before part 2 is complete; the build then demands every Midtrans and WhatsApp credential and refuses to start without them.
2. Never set `NEXT_PUBLIC_FLAG_PRELAUNCH` for Preview or Development, never scope a production variable to Preview, and never put a sandbox (`SB-`) key into production.
3. Never turn `booking_enabled` or `whatsapp_enabled` on in pre-launch. The code keeps booking closed regardless, but the switches are the second layer and `/api/health` stays red while either is on.
4. Never copy a secret between staging and production, in either direction; never paste a secret into a chat, an issue, a pull request or a message.
5. Never migrate production by hand or deploy before the migration; never run `supabase config push` against production (it would push the local Auth settings).
6. Never write the domain's DNS values, `<prod-ref>`, a key or a screenshot with values into the repository.

---

## Part 2: Leaving pre-launch (launch)

Do these in order. Each step is a prerequisite of the next; do not open booking before the last one.

### 1. Paid plans first

- **Vercel Pro.** Create the team `Kelurahan Gisikdrono` on **Pro** (Task P0.1.03, OD-5) and transfer the `gisikdrono-production` project into it (**Settings** > **General** > **Transfer**). Hobby is personal and non-commercial; a site that takes payments for the kelurahan is not that. Check afterwards that the variables, the domain, the Ignored Build Step and Deployment Protection came along.
- **Supabase Pro.** Upgrade the production organisation to **Pro**, with the spend cap on and **Require MFA** for every member. Then turn on what Free did not offer (staging-setup.md marks them **production only**): **Leaked password protection**, session **Time-box 12 hours** and **Inactivity timeout 2 hours**, and confirm daily backups are listed. A Pro project is never paused.
- Image transformations now exist: in Vercel, **delete** `NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS` (or set it to `on`). A launched production refuses `off`.

### 2. Midtrans production keys and the notification URL

1. The owner of the kelurahan's Midtrans production account follows `docs/Security.md` §3.9: put `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID` and `MIDTRANS_IS_PRODUCTION=true` into a file the repository ignores, such as `.env.midtrans-production`, and run `pnpm midtrans:check -- --file .env.midtrans-production`. It must answer "is a production key". Keep the output for the release PR (go-live #7).
2. Add the three values to Vercel, **Production** only, **Sensitive**. Delete the file.
3. Midtrans production dashboard > **Settings** > **Configuration**: **Payment Notification URL** `<site>/api/webhooks/midtrans/<MIDTRANS_WEBHOOK_PATH_TOKEN>` (the token from the Bitwarden note of 5.3); leave the redirect URLs empty; payment methods **QRIS** and **Virtual Account** only (Task P5.7.03). The full URL carries the token: Bitwarden only.

### 3. WhatsApp

1. Meta Business: the approved number and System User token (Task P0.1.08). Add `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` and `WHATSAPP_APP_SECRET` to Vercel, Production only, Sensitive.
2. Every template of `docs/notifications.md` / `docs/Task.md` Appendix B approved in language `id`.
3. Meta webhook: callback `<site>/api/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN` from the note. The handshake works once the next deployment (step 4) is live.

### 4. Remove the pre-launch flag

1. In Vercel, **delete** `NEXT_PUBLIC_FLAG_PRELAUNCH`.
2. Deploy: **Production release** (dry run, then apply, for any migration since the last release), then move `production` as in part 1 step 5.4. The build now refuses to start if any Midtrans or WhatsApp credential is missing, or if a key is a sandbox key; fix the variable and redeploy, never relax `src/lib/env.ts`.
3. Check: the package pages show **Pesan Sekarang** again, `/api/webhooks/midtrans/<anything>` still answers 404 to a wrong token, and the jobs `payments-poll` and `reconcile-payments` report real runs in the log (`job_run` without `skipped`).
4. Complete the Meta webhook verification of step 3.3, send a test message with `pnpm wa:send-test`, then turn WhatsApp on in **/dashboard/settings** (or `update public.site_settings set value = to_jsonb(true) where key = 'whatsapp_enabled';`).

### 5. The go-live checklist

Run `docs/Task.md` Appendix C (cross-referenced to `docs/Security.md` §13.1) item by item, with evidence attached to the release PR and signed by the product owner (Task P5.7.06). Monitoring (Task P5.7.05) and the staff launch (P5.7.07) belong here too.

### 6. The IDR 10 000 QRIS test and refund

Task P5.7.03, with booking still closed to the public: an RW admin makes a booking at the counter (walk-in, without cash) for a test package whose total is IDR 10 000, with the operator's own phone; the operator pays it with QRIS from the pay link; check that the tickets are issued and the WhatsApp and email messages arrive; then the superadmin refunds it through **/dashboard/finance** (`record_refund`), with its credit note. Archive the test package afterwards. Record the order id and the refund in the release PR.

### 7. Open booking

Only now, as the superadmin with a fresh TOTP, open booking:

```sql
update public.site_settings set value = to_jsonb(true) where key = 'booking_enabled';
```

Open a package page, go through the wizard to the Snap page once, and leave the hold to lapse. Keep watching `/api/health`, `security_alerts` and `/dashboard/finance/reconciliation` for the first days.
