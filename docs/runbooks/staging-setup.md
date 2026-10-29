# Runbook: putting the staging site online

Owner: the repository owner (accounts and secrets) with the Dev on call. Source of truth: `CLAUDE.md` §2.1, §6.5, §7.7 and §10.2, `src/lib/env.ts`, `src/lib/public-env.ts`, `docs/Task.md` P0.1, P0.3 and P1.7, `docs/Security.md` §3.9, §5.5 and §13.1, `docs/runbooks/cron.md`.

This guide takes you, step by step on Windows, from no accounts to an online staging site that the kelurahan can open to follow progress. Follow the parts in order: each one needs values from the one before.

| Part | What you do | You need from before |
|---|---|---|
| A | Create the Supabase project `gisikdrono-staging` | nothing |
| B | Create the Vercel project and its stable staging address | nothing |
| C | Collect and generate every secret, put them into Vercel | A, B |
| D | Fill the database (migrations), mirror the Auth settings | A, B, C, and this runbook's pull request merged |
| E | Create the first superadmin and sign in with TOTP | D |
| F | Smoke checklist | E |
| G | What not to do | always |

**Cost: Rp0.** Staging runs on free plans: Supabase **Free**, Vercel **Hobby**, Cloudflare Turnstile (free) and the Midtrans sandbox (free). Production needs paid plans: Supabase **Pro** and Vercel **Pro** (Tasks P0.1.01, P0.1.03, OD-5), and they must be in place **before go-live**. Steps that only make sense on Pro are marked **production only** below; skip them for staging.

What the staging site is, and is not:

- It runs the code of `main` on the Midtrans **sandbox**, against its own Supabase project, with **demo content only** (the invented packages, prices, sessions and products marked `DATA CONTOH` in `scripts/seed-demo-content.sql`, plus the RW texts retold from the kelurahan's own site). Tell the kelurahan that the packages and prices are examples, not offers.
- Booking stays closed (`booking_enabled` off), WhatsApp is off (`whatsapp_enabled` off, no Meta token), email is off (`email_enabled` off) until Resend is set up.
- Search engines are told to stay away on every page (part B, "Why it stays out of search engines").
- It holds no real visitor data. Never type a real visitor's name, phone number or email into it.

**The repository is public.** Anyone can read this guide, the code, the migrations and the names of every variable. So:

- Nothing secret is ever written into the repository, its issues or its pull requests: secrets live only in Vercel, Supabase, GitHub environment secrets and Bitwarden.
- The staging site itself is protected only by **obscurity and noindex**: its address is not published anywhere and search engines are told not to index it (part B). Anyone who learns the link can open it. Treat everything on staging as public: demo content only, booking closed, no real visitor data, sandbox keys only.
- Because this guide is public, do not use the example address below as it is: choose a name nobody can guess (part B step 6), and never write the real staging address into the repository.

Throughout this guide, `<staging-url>` means your staging address, for example `https://gisikdrono-staging-<random>.vercel.app` (no slash at the end), and `<ref>` means the 20-letter Supabase project ref.

## Before you start

1. **Bitwarden.** You need the organisation vault of Task P0.3.01, with a collection per provider (Supabase, Vercel, GitHub, Midtrans, Cloudflare). Every password, key and recovery code in this guide goes there and nowhere else.
2. **An authenticator app** on your phone (Bitwarden Authenticator, 2FAS, Google Authenticator or similar). You use it for your own MFA on each provider and for the superadmin's TOTP in part E.
3. **Your local clone** of the repository at `C:\Users\<you>\gisikdrono-edu-wisata`, up to date (`git pull`) and installed (`pnpm install`), as for local development. Check Node in PowerShell: `node --version` must print `v22` or newer.
4. **Admin rights** on the GitHub repository `MuhammadNur02/gisikdrono-edu-wisata`.
5. **Your Midtrans sandbox account** (the one you already use for local development).

Rule for the whole guide: secrets are typed or pasted only into the provider's own page, into Vercel, into GitHub environment secrets or into Bitwarden. Never into a chat (including an AI assistant), an issue, a pull request, an email or a WhatsApp message, and never into a file inside the repository folder.

---

## Part A: Supabase project

### Which plan

Staging uses the **Free** plan (decision of 2026-10-23: staging free, production Pro). Production keeps **Pro**, as Task P0.1.01 and `docs/PRD.md` A3 decide. What Free lacks, and how staging copes:

| Feature | Free | Pro | Staging on Free |
|---|---|---|---|
| Image transformations (`/storage/v1/render/image`) | no | yes | Built with `NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS=off`: photos are served as their plain `public-media` files (`src/lib/images/public-object-loader.ts`), already shrunk to 1600 px WebP on upload. Production refuses the flag and keeps the transformer |
| Leaked-password protection | no | yes | **Production only**; staging relies on the 8-character password policy and TOTP |
| Session time-box (12 h) and inactivity timeout (2 h) | no | yes | **Production only**; staging sessions are not time-boxed, so sign out of the dashboard after use |
| Daily backups | no | yes (7 days) | None on staging; it holds demo content only, which the workflow can write again. No backup of production is ever restored here: the restore drill runs on a throwaway local stack (`docs/runbooks/restore-drills.md`, PRD §13.1 A27) |
| Always on | **paused after 7 days without activity** | always on | See "When Supabase pauses the staging project" in part F |
| Custom access token hook | yes | yes | Same as production; the app's roles come from it |
| TOTP MFA, captcha, rate limits, custom SMTP | yes | yes | Same as production |
| Password and MFA Verification Attempt hooks | no | **no** (Team and Enterprise only) | Not used on staging or production (decision of 2026-10-20, `docs/Security.md` §5.5); they run locally and in CI only |

Free costs nothing and allows two active projects per organisation. **Production only:** Pro costs USD 25 a month per organisation, includes compute credit for one small project, and is needed before go-live; turn its spend cap on.

### Steps

1. Open https://supabase.com and sign up with the **dedicated staging account** you already use for staging (its own Gmail address), not the institutional one: then nothing that account can reach, including the access token of part D, can touch production. Production gets its own organisation under the institutional email (Task P0.1.01). Then open your account (top right) > **Account preferences** > **Multi-factor authentication** and add your authenticator app. Save the recovery codes in Bitwarden (collection Supabase).
2. Create the organisation: name `Kelurahan Gisikdrono`, type of organisation **Government** or **Non-profit**, plan **Free**. No payment method is needed.
3. **Production only:** organisation-wide **Require MFA** and the spend cap belong to the paid plan. On Free, make sure every member of the organisation has MFA on their own account (step 1); for now that is only you.
4. Click **New project** and fill in:
   - Name: `gisikdrono-staging` (exactly this; the migration workflow of part D refuses any other name).
   - Database password: click **Generate a password**, then copy it into a new Bitwarden login item `Supabase gisikdrono-staging database password`. You need it again in part D.
   - Region: **Southeast Asia (Singapore)**, which is `ap-southeast-1` (`CLAUDE.md` §2.1).
   - Security options, if the form shows them: keep **Data API + Connection String** and **Use public schema for Data API**. If it offers to enable RLS automatically on new tables, leave that off: the migrations enable and force RLS themselves.
5. Click **Create new project** and wait until the status shows **Healthy** (a few minutes).
6. Open **Project Settings** > **General** and copy the **Project ID** (20 lowercase letters). That is `<ref>`. Put it in Bitwarden next to the database password.

The Auth and API settings come in part D, once the staging address exists.

---

## Part B: Vercel project

### The decision: staging is a Preview deployment of a `staging` branch

`src/lib/env.ts` and `src/lib/public-env.ts` decide everything from `VERCEL_ENV`, which Vercel sets itself:

| | `VERCEL_ENV=production` | `VERCEL_ENV=preview` |
|---|---|---|
| Midtrans keys | live keys only; `SB-` keys refused; `MIDTRANS_IS_PRODUCTION` must be `true` | sandbox keys; `MIDTRANS_IS_PRODUCTION` must be `false` |
| WhatsApp credentials | all four required | optional (WhatsApp stays off) |
| WhatsApp contact number | sample numbers refused | any valid number |
| Search engines | `robots.txt` allows indexing | `X-Robots-Tag: noindex, nofollow` on every page, `robots.txt` disallows everything (`next.config.ts`, `src/app/robots.ts`) |
| CSP | enforced | report-only, as `docs/Security.md` §8.2 plans for staging |

A separate Vercel project whose production branch is `main` would run with `VERCEL_ENV=production`: it would demand live Midtrans keys and WhatsApp credentials and would let search engines in. So staging is the **Preview** environment of the one project, as `CLAUDE.md` §2.1 already says ("Preview = staging Supabase + Midtrans sandbox"), on a long-lived branch named `staging` with a fixed address.

No change to `src/lib/env.ts` is needed, and none is made: an extra "this is staging" switch would be a lever that, set by mistake on the real production deployment, could let sandbox keys or indexing through.

The `staging` branch is moved only by the workflow of part D, which migrates the staging database first and then moves the branch, so a staging build never runs against an older database (`docs/runbooks/release-checklist.md`: migrate first, then deploy). The kelurahan sees what you released to staging, not every merge.

### Which plan

Staging uses **Hobby**, a free personal account (decision of 2026-10-23). Everything below works on Hobby: the Ignored Build Step, a domain tied to a branch, Preview-only variables, Standard Protection with Vercel Authentication, and Deployment Protection Exceptions. **Production only:** Task P0.1.03 and OD-5 choose a **Pro** team, which production needs before go-live; Vercel limits Hobby to personal, non-commercial use, and a site that takes payments for the kelurahan is not that.

### Steps

1. Open https://vercel.com and sign up with the same **dedicated staging account** (Hobby is a personal account; production gets a Pro team under the institutional email); add MFA under **Account Settings** > **Authentication**. Save the recovery codes in Bitwarden (collection Vercel). Choose **Hobby** when asked for a plan; the `Kelurahan Gisikdrono` team is **production only** (Pro).
2. Click **Add New** > **Project** > **Import Git Repository**. Install the Vercel GitHub app when asked, giving it access to **only** `gisikdrono-edu-wisata`. Choose the repository.
3. On the import screen: project name `gisikdrono-edu-wisata`, framework **Next.js** (detected), root directory `./`. Add **no** environment variables here (this screen would add them to every environment). Click **Deploy**.
   - This first deployment is a production build of `main` and **fails** with an environment error. That is expected: production has no variables, and part B step 5 stops production builds from now on.
4. **Settings** > **Build and Deployment**: set **Node.js Version** to `22.x`.
5. Same page, **Ignored Build Step**: choose **Custom** and enter exactly:

   ```bash
   [ "$VERCEL_GIT_COMMIT_REF" != "staging" ] || [ "$VERCEL_GIT_REPO_OWNER" != "MuhammadNur02" ] || [ -n "$VERCEL_GIT_PULL_REQUEST_ID" ]
   ```

   Vercel **skips** a build when this command exits 0 and **builds** when it exits 1. The command exits 0 as soon as one test is true, so it builds only when all three hold: the branch is `staging`, the repository belongs to `MuhammadNur02`, and the deployment is not for a pull request. Pushes to `main`, every pull-request branch and every fork (including a fork's branch that is also named `staging`) no longer start builds, so no failing production builds, no previews against an unmigrated database, and no fork code next to the staging variables. Remove it when production is set up (see "At go-live" at the end).
5a. **Settings** > **Security** (in some versions **Settings** > **Git**): keep **Git Fork Protection** **on**. Then a pull request from a fork never deploys without your approval. **Never click Authorize** on a fork's deployment request: its code would run with the staging variables.
6. **Settings** > **Domains** > **Add Domain**: type `gisikdrono-staging-<random>.vercel.app`, where `<random>` is 8 random lowercase letters and digits (for example from Bitwarden's generator). The repository is public, so a guessable name such as `gisikdrono-staging.vercel.app` would defeat the obscurity that protects staging. Add it, then open its **Edit** menu, choose **Connect to an environment: Preview** and type the Git branch `staging`. Save.
   - Whatever name you choose is `<staging-url>` from now on. Keep it in Bitwarden and share it with the kelurahan directly; never write it into the repository, an issue or a pull request.
   - If Vercel refuses a `*.vercel.app` name here, skip this step: after the first staging build (part D) the deployment page shows a fixed branch address such as `gisikdrono-edu-wisata-git-staging-<team>.vercel.app`. Use that as `<staging-url>`, update `NEXT_PUBLIC_SITE_URL`, the Vault value `jobs_base_url`, the Turnstile hostname and the Supabase URLs, then redeploy.
   - Later, with the kelurahan's own domain (A11), `staging.<domain>` replaces it the same way.
7. **Settings** > **Deployment Protection** (Hobby):
   - **Vercel Authentication**: leave it **on**, scope **Standard Protection** (the Hobby default). Every preview address then asks for a Vercel login, which kelurahan staff do not have.
   - **Deployment Protection Exceptions** > **Add Domain**: type `<staging-url>` without `https://`, then confirm by typing it again and `unprotect my domain`. Only this one address opens without a login; every other preview address stays behind Vercel Authentication (Task P0.1.03).
   - **Password Protection** is not available on Hobby (**production only**, a Pro add-on). Do not switch Vercel Authentication off for the whole project instead of the exception.

### How the kelurahan opens the link without a Vercel account

With the exception of step 7, kelurahan staff open `<staging-url>` in any browser, on a phone or a laptop, with no account and no password. Share the link with them directly (WhatsApp to the people concerned, in person); never post it.

This means staging is protected **only by obscurity** (an unguessable address that is never published) **and noindex**. Anyone who learns the link can open it, and the repository that describes it is public. That is acceptable only because staging carries sandbox keys only, demo content only, booking closed and no visitor data. The exception also lets the database's scheduled jobs (`pg_net`) and, later, Midtrans sandbox notifications reach the staging routes, which a protected address would answer with 401.

**The recorded exception.** RL-06 and Task P0.1.03 want every preview behind Vercel Authentication. The owner decided on 2026-10-23 to except this one staging domain; the exception is written down in `docs/Security.md` §8.8 (and the RL-06 row) and under Task P0.1.03: every other preview answers 401, production is unaffected. **Production only:** if the decision is withdrawn once on Pro, Password Protection (about USD 20 a month per project) restores the control as written.

### Why it stays out of search engines

You do not need to do anything for this; part F checks it.

- Every response of a Preview deployment carries `X-Robots-Tag: noindex, nofollow` (`next.config.ts`), and the private routes also carry `Cache-Control: private, no-store`.
- `/robots.txt` answers `Disallow: /` on Preview (`src/app/robots.ts`), and there is no sitemap link.
- noindex keeps the site out of search results; it does not stop a person who has the link. Do not post the staging link on public pages, social media or anywhere in this public repository; share it with the kelurahan directly.

---

## Part C: Secrets

### C.1 Midtrans sandbox keys

1. Open https://dashboard.sandbox.midtrans.com and sign in to **your sandbox** account. Check the environment switch at the top says **Sandbox**, never Production.
2. Open **Settings** > **Access Keys**. Keep the page open: you copy **Merchant ID**, **Client Key** and **Server Key** in C.3.
3. The Payment Notification URL (Task P0.1.06; the route came with Task P3.8.03): open **Settings** > **Configuration** and set **Payment Notification URL** to `<staging-url>/api/webhooks/midtrans/<MIDTRANS_WEBHOOK_PATH_TOKEN>`, with the staging address and the same path token you put into Vercel in C.3. Leave **Finish / Unfinish / Error Redirect URL** empty: each payment sends its own (`/reservasi/<code>`). The full address carries the token, so it goes into Bitwarden next to the token and **never** into the repository, an issue, a chat or a screenshot. A wrong token answers 404 and Midtrans retries for a while; a wrong server key answers 403 and lands in `webhook_rejections` (`docs/Security.md` §3.3). Booking stays closed until Task P3.12.01, so until then the URL only receives Midtrans' own **Test notification** button, which names an order we never issued and so changes nothing.

### C.2 Cloudflare Turnstile widget

Preview deployments refuse Cloudflare's test keys (`src/lib/public-env.ts`), so staging needs a real widget. It is free.

1. Open https://dash.cloudflare.com, sign up with the institutional email and add MFA (**My Profile** > **Authentication**).
2. Open **Turnstile** > **Add widget**: name `gisikdrono-staging`, hostname = your staging host only, without `https://` (for example `gisikdrono-staging-<random>.vercel.app`), widget mode **Managed**, pre-clearance **No**. Create it.
3. Keep the page with the **Site Key** and **Secret Key** open for C.3. One widget is enough for staging: every form uses `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and Supabase Auth checks the sign-in token with the same widget's secret (D.6).

### C.3 Generate the random values and fill in the rest

1. In PowerShell:

   ```powershell
   cd $env:USERPROFILE\gisikdrono-edu-wisata
   git pull
   node scripts/generate-staging-secrets.mjs
   notepad $env:USERPROFILE\gisikdrono-staging-secrets.txt
   ```

   The script writes `%USERPROFILE%\gisikdrono-staging-secrets.txt`, outside the repository, and prints only that path, never a value. It refuses a path inside the repository and never overwrites an existing file (move the old one to Bitwarden and delete it first, or pass `--out <path>`).

2. Fill in every line that ends in `=` with nothing after it. Each has a comment saying where its value comes from. This is the complete staging list:

| Variable | Side | Value comes from | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | P | `<staging-url>` | no slash at the end |
| `NEXT_PUBLIC_SUPABASE_URL` | P | Supabase > Project Settings > Data API > Project URL | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | P | Supabase > Project Settings > API Keys > **Legacy API keys** > `anon` `public` | see the note below the table |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | P | Cloudflare Turnstile widget > Site Key | never a `1x…`, `2x…` or `3x…` test key |
| `NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER` | P | the kelurahan's public contact number, if they agree it may appear, else `+6281200000000` | the floating chat button opens it |
| `SUPABASE_SERVICE_ROLE_KEY` | S | Supabase > API Keys > Legacy API keys > `service_role` `secret` | full database access; treat as the most sensitive value |
| `MIDTRANS_SERVER_KEY` | S | Midtrans **sandbox** > Access Keys > Server Key | `SB-Mid-server-…` or `Mid-server-…` |
| `MIDTRANS_CLIENT_KEY` | S | Midtrans **sandbox** > Access Keys > Client Key | `SB-Mid-client-…` or `Mid-client-…` |
| `MIDTRANS_MERCHANT_ID` | S | Midtrans **sandbox** > Access Keys > Merchant ID | `G…` or `M…` and digits |
| `MIDTRANS_IS_PRODUCTION` | S | fixed `false` | already filled |
| `MIDTRANS_WEBHOOK_PATH_TOKEN` | S | generated | |
| `WHATSAPP_VERIFY_TOKEN` | S | generated | required by `src/lib/env.ts` even with WhatsApp off |
| `RESEND_API_KEY` | S | fixed placeholder `email-off-on-staging` | required by `src/lib/env.ts`; email stays off; replaced when Resend is set up (P0.1.09) |
| `EMAIL_FROM` | S | fixed placeholder | replaced with the `mail.<domain>` sender later |
| `NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS` | P | fixed `off` | Supabase Free has no image transformer, so photos are served as plain files; production leaves it unset and refuses `off` |
| `QR_SIGNING_KEYS`, `QR_SIGNING_ACTIVE_KID` | S | generated, kid `k1` | the kid must also be in `site_settings` `qr.signing_kids` (D.4), which the migration seeds as `["k1"]` |
| `BOOKING_LINK_SECRET` | S | generated | |
| `OTP_PEPPER` | S | generated | also Vault `otp_pepper` (D.1) |
| `CRON_SECRET` | S | generated | also Vault `cron_secret` (D.1) |
| `TURNSTILE_SECRET_KEY` | S | Cloudflare Turnstile widget > Secret Key | also Supabase Attack Protection (D.6) |
| `SECURITY_ALERT_EMAIL` | S | your own mailbox | |
| `SECURITY_ALERT_WA_PHONE` | S | your own phone, `+628…` | |
| `MIDTRANS_SERVER_KEY_PREVIOUS` | S | **unset** | only during a key rotation |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET` | S | **unset** | WhatsApp stays off |
| `RESEND_WEBHOOK_SECRET` | S | **unset** | no Resend yet |
| `PARTICIPANT_PII_KEYS`, `PARTICIPANT_PII_ACTIVE_KID` | S | **unset** | Task P4.5.04 |
| `NEXT_PUBLIC_SENTRY_DSN` | P | **unset** | Task P0.1.11 |
| `SUPABASE_DB_URL`, `SENTRY_AUTH_TOKEN`, `BACKUP_AGE_PUBLIC_KEY`, `R2_*`, `VERCEL_AUTOMATION_BYPASS_SECRET` | CI | **not for staging** | these belong to production backups and later CI jobs; never put staging values in the repository-level secrets that `backup.yml` reads |

Side: P = shipped to the browser (`NEXT_PUBLIC_*`), S = server only, CI = GitHub Actions only. `VERCEL_ENV` is set by Vercel; never add it yourself.

Supabase keys: the local stack and CI run with the classic `anon` and `service_role` keys, so staging uses the same kind from the **Legacy API keys** tab. If your project shows only the newer `sb_publishable_…` and `sb_secret_…` keys, use the publishable key for `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the secret key for `SUPABASE_SERVICE_ROLE_KEY`, and tell the Dev on call, because the app has not been tried with them yet.

### C.4 Prove the Midtrans keys are sandbox keys

`docs/Security.md` §3.9: no Midtrans key is saved anywhere before this check passes. In PowerShell, in the repository folder:

```powershell
pnpm midtrans:check -- --file "$env:USERPROFILE\gisikdrono-staging-secrets.txt"
```

It must answer `… is a sandbox key (https://api.sandbox.midtrans.com: 404 Transaction doesn't exist…)`. If it answers that the sandbox refused the key (401), stop: the key comes from the wrong dashboard or is mistyped. Copy it again from the **sandbox** dashboard and run the check again. The output never contains a key; keep it for go-live check #7.

### C.5 Put the values into Vercel

1. Vercel > the project > **Settings** > **Environment Variables**.
2. Click **Add Environment Variable** (or **Add New**). For **Environments**, tick **Preview** only and, in the Preview branch field, choose **Select a custom Preview branch** and type `staging`; untick **Production** and **Development**. No other branch then sees these values. Switch **Sensitive** on where Vercel offers it.
3. Copy the whole content of the secrets file and paste it into the first **Key** field: Vercel splits a pasted `.env` block into one row per variable and skips the comment lines. If your Vercel version does not split it, add each line by hand: the name is left of the first `=`, the value is everything right of it.
4. Check the list: 23 variables, every one scoped to **Preview (branch `staging`)**, none to all Preview branches, Production or Development. Save.

### C.6 Bitwarden, then delete the file

1. In Bitwarden (collection Vercel), create a **Secure Note** `gisikdrono staging environment <date>` and paste the whole file into it. Keep the note open: part D needs `CRON_SECRET` and `OTP_PEPPER`.
2. Delete the file in PowerShell (this bypasses the Recycle Bin):

   ```powershell
   Remove-Item "$env:USERPROFILE\gisikdrono-staging-secrets.txt"
   ```

---

## Part D: Database

Path chosen: the manual GitHub workflow `.github/workflows/staging-db.yml` (**Actions** > **Staging release**). It runs from `main` only, checks that the ref really belongs to a project named `gisikdrono-staging`, lists the migrations, applies them with `supabase db push`, and then fast-forwards the `staging` branch to the same commit so Vercel builds it. With the input **seed_demo** ticked it also writes the demo content of `scripts/seed-demo-content.sql` (the same file `pnpm db:seed` uses locally), between the migrations and the deploy. It never writes the development staff accounts of `scripts/seed-dev.sql` and never uses the CLI's own seed (`supabase/config.toml` `[db.seed]` stays off). The demo file refuses any database whose Vault secret `environment` is not `local` or `staging`, on top of the workflow's project-name check.

### D.1 Vault secrets, before the first migration

`internal.call_job` reads these four Vault secrets (`supabase/migrations/0007_cron.sql`, Task P0.3.03). Note: `environment` and `jobs_base_url` are **Vault** secrets, not `site_settings` rows. Set them first, so the scheduled jobs never run unconfigured.

In Supabase: **Integrations** > **Vault** (in some dashboard versions **Project Settings** > **Vault**) > **Add new secret**, four times. Names exactly as written, lower case:

| Name | Value |
|---|---|
| `environment` | `staging` |
| `jobs_base_url` | `<staging-url>` (must start with `https://`) |
| `cron_secret` | the `CRON_SECRET` value from your Bitwarden note |
| `otp_pepper` | the `OTP_PEPPER` value from your Bitwarden note |

If the Vault page is missing, use **SQL Editor** instead, one statement per secret, `select vault.create_secret('<value>', '<name>');`, and delete the SQL snippet afterwards so the value is not kept in the editor's history. Check (shows names only, never values):

```sql
select name from vault.secrets order by name;
```

It must list `cron_secret`, `environment`, `jobs_base_url`, `otp_pepper`. Never set `environment` to `local`: that is what lets the development seed and quiet job failures through.

### D.2 The GitHub environment `staging`

1. Create a Supabase access token **while signed in to the dedicated staging account** of part A, never the institutional one: https://supabase.com/dashboard/account/tokens > **Generate new token**, name `github-staging-release`, expiry **30 days** (or the shortest offered). A token acts as its whole account, so on the staging-only account it can reach the staging project and nothing else; the workflow's project-name check and the branch rule below keep it pointed at staging as well.
   - **Rotation:** put the expiry date in your calendar. Before it, generate a new token, replace `SUPABASE_ACCESS_TOKEN` in the GitHub environment, then delete the old token on the same Supabase page. Rotate at once, too, if anyone with GitHub admin rights leaves or the token may have been seen.
2. GitHub > the repository > **Settings** > **Environments** > **New environment** `staging`.
   - **Deployment branches and tags**: **Selected branches and tags** > add `main`.
   - **Required reviewers**: add yourself, so every run waits for your click.
3. In the environment, **Add environment secret** three times:

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token of step 1 |
| `SUPABASE_DB_PASSWORD` | the database password from Bitwarden (part A step 4) |
| `STAGING_PROJECT_REF` | `<ref>` |

The repository is public, and that is safe here: environment secrets are never shown in logs (GitHub masks them), workflows started by pull requests from forks get no secrets, only people with write access can start **Staging release**, and the environment accepts runs from `main` only and waits for your approval. Under **Settings** > **Actions** > **General**, keep **Require approval for all outside collaborators** for fork pull requests.

### D.3 Run the migrations and the first deploy

The workflow file reaches `main` with the pull request that added this runbook; merge it first.

1. GitHub > **Actions** > **Staging release** > **Run workflow**. Branch `main`, **dry_run** ticked. Approve the run when GitHub asks (required reviewer).
2. Open the run > **migrate the staging database** > step **Migrations that would run**. On a new project it lists every file of `supabase/migrations`, from `0001_extensions.sql` to the newest.
3. Run it again with **dry_run** unticked, **seed_demo** ticked (the first time, and whenever the demo content changed) and **deploy** ticked. The migrate job applies the migrations and writes the demo content: the RW 05, RW 13 and RW 08 profiles and activity points, the demo packages, session templates and the sessions planned from them, UMKM vendors and products, and two articles. It writes no gallery photo, hero banner or e-booklet (those need real files), so those pages show their "Foto menyusul" placeholders until D.7 uploads the photos. Running it again changes nothing. The deploy job then creates or fast-forwards the branch `staging`.
4. Vercel > **Deployments**: a **Preview** deployment of `staging` starts. Wait for **Ready**. If it fails, open the build log: a missing or malformed variable is named there (`src/lib/env.ts`); fix it in Vercel and click **Redeploy**.

If the migrate job cannot reach the database (a network error in **Link the staging project** or **Apply the migrations**), the same can be done from your PC with the Supabase CLI you use locally: `supabase login`, `supabase link --project-ref <ref>` (type the database password when asked), `supabase db push --linked --dry-run`, then `supabase db push --linked`, and finally `git push origin main:staging`. Never add `--include-seed`. If only the demo step fails (it reads the pooler address `supabase link` leaves behind), open `scripts/seed-demo-content.sql` on GitHub, copy it whole into the Supabase **SQL Editor** and run it there once; it refuses to run unless D.1 marked the database `staging`. Never paste `scripts/seed-dev.sql` anywhere but your local stack.

### D.4 Staging switches

Supabase > **SQL Editor**, run:

```sql
update public.site_settings set value = to_jsonb(false)
where key in ('booking_enabled', 'whatsapp_enabled', 'email_enabled');

select key, value from public.site_settings
where key in ('booking_enabled', 'whatsapp_enabled', 'email_enabled', 'maintenance_mode')
order by key;
```

All four must read `false`. Then check that the QR kid of Part C is in the database's list, since an RW admin's cash at the counter is refused with any other and `/api/health` answers 503 until it is (`20261104220100`, Task P4.3.10):

```sql
select value from public.site_settings where key = 'qr.signing_kids';
```

It must contain the `QR_SIGNING_ACTIVE_KID` you set (`["k1"]` for the generated secrets). For another kid, add it as the superadmin: `update public.site_settings set value = value || '["<kid>"]'::jsonb where key = 'qr.signing_kids';`.

`booking_enabled` is already off from the migration `20261023090000`; the two channel switches default to on, so they are turned off here. Booking is opened only by the later migration of Task P3.12.01, never by hand (a short trial needs the superadmin's fresh TOTP and is closed again straight after; `docs/runbooks/release-checklist.md`).

### D.5 Pause the jobs whose routes do not exist yet

Three scheduled application jobs call routes that later phases add (`payments-poll`, `anomaly-scan`, `reconcile-payments`). Until then each call answers 404 and is recorded as a failed run with a `cron_failed` security event every few minutes. Pause them, as `docs/runbooks/cron.md` describes:

```sql
select cron.alter_job(job_id := jobid, active := false)
from cron.job where jobname in ('payments-poll', 'anomaly-scan', 'reconcile-payments');

select jobname, active from cron.job order by jobname;
```

Resume each one (`active := true`) in the staging release that ships its route: `payments-poll` with Tasks P3.9 and P3.10 (`docs/runbooks/release-checklist.md`).

### D.6 Auth and API settings to mirror from `supabase/config.toml`

`supabase/config.toml` configures the local stack only; the hosted project needs the same settings by hand (Tasks P0.1.14 to P0.1.18, P1.7.01 to P1.7.05). Take a screenshot of each screen for the vault. Menu names move between dashboard versions; search the Authentication menu if one is elsewhere.

| Where (Supabase dashboard) | Setting | Value |
|---|---|---|
| Authentication > Sign In / Providers | Allow new users to sign up | **off** (invite-only, AUTH-01) |
| | Email provider | on; Confirm email **on**; Secure email change **on** |
| | Email OTP | length 8, expiry 600 seconds |
| | Phone, anonymous, every OAuth provider | off |
| | Minimum password length / requirements | 8; lowercase, uppercase, digits and symbols |
| Authentication > Attack Protection | Leaked password protection | **production only** (Pro); not offered on Free |
| | Captcha protection | **on**, provider Cloudflare Turnstile, secret = `TURNSTILE_SECRET_KEY` |
| Authentication > URL Configuration | Site URL | `<staging-url>` |
| | Redirect URLs | exactly one: `<staging-url>/auth/callback` |
| Authentication > Sessions | Refresh token rotation | on, reuse interval 10 seconds |
| | Time-box user sessions / inactivity timeout | **production only** (Pro): 12 hours / 2 hours; not offered on Free |
| Authentication > Sessions, or Project Settings > JWT Keys | Access token (JWT) expiry | 900 seconds |
| Authentication > Multi-Factor | TOTP (app authenticator) | enroll and verify **on** |
| | Phone MFA | off |
| | Maximum factors per user | 1 |
| Authentication > Auth Hooks | Customize Access Token (JWT) Claims | **on**, type Postgres, schema `public`, function `custom_access_token_hook` |
| | Password Verification Attempt, MFA Verification Attempt | **leave off** (not on Pro; `docs/Security.md` §5.5) |
| Authentication > Rate Limits | Sign-ups and sign-ins | 10 per 5 minutes per IP |
| | Token verifications | 30 per 5 minutes |
| Authentication > Emails > Templates > Reset Password | Subject and body | the subject in `supabase/config.toml` `[auth.email.template.recovery]` and the HTML of `supabase/templates/recovery.html`, pasted as it is |
| Authentication > SMTP Settings | Custom SMTP | leave off until Resend (P0.1.16); Supabase's built-in sender only mails members of your Supabase organisation, a few per hour, which is enough for your own password reset |
| Project Settings > Data API | Exposed schemas | `public` only (remove `graphql_public`) |
| | Max rows | 100 |
| Database > Settings | Enforce SSL on incoming connections | on |

The custom access token hook must be on **before** part E: the superadmin's role reaches the app only through it.

### D.7 Photos for the staging pages (`pnpm db:seed:staging-media`)

After D.3 has written the demo content, this fills the photos so the pages stop showing "Foto menyusul". It uploads the two photo sets of `pnpm db:seed --media` / `--official-media` (`scripts/demo-media.ts`, `scripts/official-media.ts`), through the same re-encoding (EXIF stripped, at most 1600 px, WebP) and the same SQL: existing rows are kept, an RW page or activity point that already has a photo keeps it, and a second run changes nothing. It writes no development account, no e-booklet and nothing else.

**Privacy rule for staging (decision of 2026-10-24).** Staging is open to anyone who has its link. The owner's visit photos (`--media`) still wait for the consent of the people in them, so on staging they appear **in the gallery only**: never as the home hero, an RW page hero, an activity point or an article photo. Those come from the kelurahan's own photos, which its website already publishes with permission. The home hero is the fish pond of RW 05 (`galeri_1781167605_244`), a photo with no people in it. No photo of children stands for any page; those appear in the gallery only. The local `pnpm db:seed --media` is unchanged.

| Set | Photos | Where they show |
|---|---|---|
| Visit photos (`--media`, folder `Foto-Gisikdrono\jpg`) | 6 RW 05 gallery photos | `/galeri` only |
| Official-site photos (`--official-media`, folder `Foto-Gisikdrono\situs-kelurahan`) | the home hero banner + 19 gallery photos: 6 RW 05, 10 RW 13, 3 RW 08 (plus copies for 3 activity points) | home hero, `/galeri`, `/rw-05-ecowastreme` (RW hero, Taman TOGA and recycled-craft points), `/rw-13-kampung-budaya-seni` (RW hero, mural point). RW 08 keeps "Foto menyusul" as its hero, because every photo of its programme shows children; the Bank Sampah point and the RW 05 article stay without a photo on staging |

Before the first write the command checks, and stops if either fails: the Management API names the project `gisikdrono-staging`, and the database's Vault secret `environment` (D.1) is `staging` (compared inside the database; the value is never shown). It prints only counts and file paths, never a key.

1. **Credentials file**, outside the repository folder (the command refuses one inside it). In PowerShell:

   ```powershell
   notepad "$env:USERPROFILE\gisikdrono-staging-media.env"
   ```

   Let Notepad create the file and type three lines, the values pasted from Bitwarden (never into a chat or the terminal):

   ```text
   STAGING_PROJECT_REF=<ref>
   SUPABASE_ACCESS_TOKEN=<a Supabase access token of the staging account>
   SUPABASE_SERVICE_ROLE_KEY=<the staging service_role key>
   ```

   - `STAGING_PROJECT_REF`: the 20-letter ref (Bitwarden, part A).
   - `SUPABASE_ACCESS_TOKEN`: signed in to the **staging account** only, https://supabase.com/dashboard/account/tokens > **Generate new token**, name `staging-media-seed`, the shortest expiry. Do not reuse the GitHub token of D.2.
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase > the staging project > **Project Settings** > **API Keys** > `service_role` (or the secret key), the value kept in Bitwarden.

   Save and close Notepad.
2. **Run** from your clone, up to date with `main`, with the two photo folders (they stay outside the repository and are never committed):

   ```powershell
   pnpm db:seed:staging-media -- --media "$env:USERPROFILE\Foto-Gisikdrono\jpg" --official-media "$env:USERPROFILE\Foto-Gisikdrono\situs-kelurahan"
   ```

   It ends with `Demo photos (gallery only): 6 placed`, `Official-site photos: 19 placed, plus the home hero` and `Done`. A file elsewhere is passed with `--credentials <file>`. If it stops at a guard, nothing was written: fix the file or D.1, then run it again.
3. **Delete the file and the token** straight after:

   ```powershell
   Remove-Item "$env:USERPROFILE\gisikdrono-staging-media.env"
   ```

   Then delete the `staging-media-seed` token on the same Supabase tokens page.
4. **Check**: open `<staging-url>/`, `/galeri`, `/rw-05-ecowastreme` and `/rw-13-kampung-budaya-seni`; the photos show (cached public pages may need up to an hour, or a redeploy of the `staging` branch in Vercel). Then run check 14 of part F.

---

## Part E: First superadmin with TOTP

The invite and onboarding screens come with Task P4.8, so the first superadmin is created by hand. `scripts/seed-dev.ts` cannot do it: it reaches `127.0.0.1` only, and its SQL refuses any database not marked `local`.

1. Supabase > **Authentication** > **Users** > **Add user** > **Create new user**:
   - Email: your own institutional mailbox (one you can read; a password reset goes there).
   - Password: generate one in Bitwarden, at least 20 characters with lowercase, uppercase, digits and symbols, and save it as a login item `gisikdrono staging superadmin`.
   - Tick **Auto Confirm User**. Create.
2. Supabase > **SQL Editor** (role selector, if shown, on `postgres`). Replace the address and run:

   ```sql
   begin;
   select set_config('app.privileged_rpc', 'on', true);
   update public.profiles p
   set full_name = 'Superadmin Staging', role = 'superadmin', is_active = true
   from auth.users u
   where u.id = p.id and u.email = 'your.name@institution.example';
   commit;

   select email, role, is_active, mfa_required from public.profiles;
   ```

   It must show one row: `superadmin`, `true`, `true`. Creating the user already gave it a profile without a role (`internal.handle_new_auth_user`), so the step updates that profile rather than inserting one. The SQL editor runs as `postgres`, and `app.privileged_rpc` is the flag `internal.profiles_guard` requires for a role change, as `set_staff_role` sets it; an API caller could do neither. The role also stamps `became_staff_at` (20261103131500).
3. Open `<staging-url>/login` in a private browser window. Enter the email and password and wait for the Turnstile check, then sign in.
4. The app sends you to **/mfa/enroll** (no factor yet). Create the QR code, scan it with your authenticator app, and type the 6-digit code. Also save the setup key it shows into the Bitwarden login item's **Authenticator key (TOTP)** field, so a lost phone does not lock you out.
5. You land on **/dashboard** at AAL2. Sign out and in once more: this time the app asks for the TOTP code at **/mfa/verify**.
6. Do not share this account. Kelurahan staff only need the public link; their own dashboard accounts come by invite once Task P4.8 ships.

If you ever lose the factor before P4.8 exists: the Dev on call removes it in the SQL editor (`delete from auth.mfa_factors where user_id = (select id from auth.users where email = '…');`) and you enrol again from step 3.

---

## Part F: Smoke checklist

Run these after every staging release. In PowerShell, set the address once, then use `curl.exe` (built into Windows):

```powershell
$u = "https://gisikdrono-staging-<random>.vercel.app"   # your <staging-url>, typed only here
```

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Home page | open `$u/` in a browser | page loads with the header, footer and RW sections; no error page |
| 2 | RW pages | open `$u/rw-05-ecowastreme`, `$u/rw-13-kampung-budaya-seni`, `$u/rw-08-inklusif-ramah-anak` | each loads |
| 3 | Old RW address | `curl.exe -sI "$u/rw-08-kampung-seni-budaya"` | `HTTP/1.1 308` with `location: /rw-13-kampung-budaya-seni` |
| 4 | A 404 | `curl.exe -s -o NUL -w "%{http_code}" "$u/halaman-yang-tidak-ada"`, and open it in the browser | `404`, and the site's own not-found page |
| 5 | Dashboard needs login | `curl.exe -sI "$u/dashboard"` | `307` with `location: /login?next=%2Fdashboard` (or the same path unencoded) |
| 6 | Login page | open `$u/login` | the form and the Turnstile check render; sign-in leads to `/mfa/verify` (part E) |
| 7 | Security headers | `curl.exe -sI "$u/"` | `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `cross-origin-opener-policy: same-origin`, `permissions-policy`, `content-security-policy-report-only` (report-only is right for staging, `docs/Security.md` §8.2), and `x-robots-tag: noindex, nofollow` |
| 8 | Private pages not cached | `curl.exe -sI "$u/login"` | also `cache-control: private, no-store` and a `content-security-policy-report-only` with a `nonce-` |
| 9 | Out of search engines | `curl.exe -s "$u/robots.txt"` | `Disallow: /` and no `Sitemap:` line |
| 10 | Jobs refuse strangers | `curl.exe -s -o NUL -w "%{http_code}" -X POST "$u/api/jobs/process-notifications"` | `401` |
| 11 | Demo content and booking closed | open `$u/paket-wisata`, then `$u/paket-wisata/paket-eduwisata-ecowastreme` | the demo packages are listed (after a run with **seed_demo**); the package page's booking wizard says booking is closed |
| 12 | Scheduled jobs | SQL editor: `select job, last_success_at, last_failure_at, last_error_code from public.job_heartbeats order by job;` | after 15 minutes `expire_stale_bookings`, `check_job_responses` and `process-notifications` show a recent `last_success_at`; no `secret_missing` or `insecure_base_url` (those mean D.1 is wrong) |
| 13 | The kelurahan's view | open `$u/` on a phone, signed out of Vercel, in mobile data | the site opens without a Vercel login or password (the exception of part B step 7) |
| 14 | Photos without the transformer | on a page with an uploaded photo, right-click it > **Copy image address** | the address contains `/storage/v1/object/public/public-media/`, never `/render/image/` (which Free answers with an error); until photos are uploaded (D.7), pages show "Foto menyusul" |

`/api/health` does not exist yet (Task P3.11.07); add it to this list, and to the uptime monitor of P0.1.12, when it ships.

### When Supabase pauses the staging project

A Free project is **paused after 7 days without activity**. Visits to the public pages may not count, because Vercel serves them from its cache. Supabase emails the owner before and when it pauses. While paused, the dashboard login, the database reads of the pages and the scheduled jobs stop; cached public pages may still show.

To resume: Supabase dashboard > the `gisikdrono-staging` project > **Restore project** (or **Resume**), and wait until it shows **Healthy** (a few minutes). Nothing needs to be set again: data, Vault secrets, Auth settings and the paused jobs of D.5 stay as they were. Then run check 12 above; the jobs catch up on their next schedule. Resume promptly: Supabase keeps a paused Free project restorable for a limited time only (90 days when this was written). To avoid pauses before a demo to the kelurahan, sign in to the staging dashboard once a few days ahead. A Pro project is never paused (**production only**).

---

## Part G: What not to do

1. Never put **live** Midtrans keys, a live merchant id or `MIDTRANS_IS_PRODUCTION=true` into staging. A live key ever saved in the Preview scope counts as leaked: remove it and rotate it at once (`docs/Security.md` §3.9, risk R23).
2. Never scope a staging variable to **Production** or **Development** in Vercel, and never reuse a staging secret for production. Production gets its own Supabase project, its own generated set and its own Midtrans account (Task P5.7.01).
3. Never paste a secret into a chat (an AI assistant included), an issue, a pull request, an email or a WhatsApp message, and never keep the secrets file inside the repository folder or commit it. Bitwarden is the only copy.
4. Never run `supabase config push` against staging: it would overwrite the hosted Auth settings with the **local** ones (site URL `127.0.0.1`, attempt hooks no hosted plan of ours has). Set Auth by hand (D.6).
5. Never run `supabase db reset --linked`, `supabase db push --include-seed` or `pnpm db:seed` against staging (photos go only through the guarded `pnpm db:seed:staging-media` of D.7), never set the Vault secret `environment` to `local`, and never edit an applied migration to fix staging (`CLAUDE.md` §6.4). A fix is a new migration released through the workflow.
6. Never enter real visitor data: no real bookings, names, phone numbers or emails of visitors or children. Demo content only, clearly invented.
7. Never switch on `booking_enabled`, `whatsapp_enabled` or `email_enabled` on staging by hand, except a short booking trial with the superadmin's fresh TOTP that is closed again straight after.
8. Never add a WhatsApp token or a real Resend key to staging before the decision to test them there; when that time comes, they are separate staging credentials.
9. Never remove the `noindex` header or the `Disallow: /` of Preview, never share the staging link on public pages, and never set the `staging` branch as Vercel's production branch (that would make it `VERCEL_ENV=production`).
10. Never relax `src/lib/env.ts` to make a deployment start; fix the variable instead.
11. Never share the superadmin login. Never disable the superadmin's TOTP.
12. Never point `.github/workflows/backup.yml` or the repository-level `SUPABASE_DB_URL` secret at staging; that job backs up production.
13. Never move the `staging` branch by hand around the workflow once it exists (a deploy before its migrations breaks the build), except in the fallback of D.3, which migrates first too.
14. Never set `NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS=off` for a launched Production (the build refuses it outside pre-launch), never set `NEXT_PUBLIC_FLAG_PRELAUNCH` for staging, and never run the demo content step or paste `scripts/seed-demo-content.sql` into a production project (the file refuses one marked `production`).
15. Never forget that the repository is public: no staging address, project ref, key, password, screenshot of a settings page with values, or log excerpt with values goes into a commit, issue, pull request or discussion. Staging's only protection is that its address stays unpublished, plus noindex.

---

## Later: releasing a new version to staging

1. Merge the work into `main` as usual.
2. If it carries a migration, read its notes in `docs/runbooks/release-checklist.md` first.
3. **Actions** > **Staging release** > run with **dry_run** ticked, read the list, then run again with **dry_run** unticked.
4. Run part F.

## At go-live (Phase 5)

Production is set up by `docs/runbooks/production-setup.md`: first in pre-launch on the free plans (`NEXT_PUBLIC_FLAG_PRELAUNCH=on`, booking and payment closed, its own Hobby account and Vercel project built from the `production` branch), then on Pro at launch. When the production project is set up (Task P5.7), undo what is staging-only here:

- **Paid plans first.** Production needs Supabase **Pro** (image transformations, leaked-password protection, session time-box, daily backups, never paused, organisation-wide MFA) and a Vercel **Pro** team (commercial use, Password Protection if wanted); none of that is optional for go-live. Create the production Supabase project `gisikdrono-prod` in the Pro organisation, and move the production Vercel project of `docs/runbooks/production-setup.md` into the Pro team (part 2 there); this staging project stays where it is.
- A launched production leaves `NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS` unset; the build refuses `off` there unless it is in pre-launch (`docs/Security.md` §8.9). Do the steps marked **production only** in this guide on the production project.
- Staging may stay on Free and Hobby, or move to the paid plans as well; if it moves, drop the flag from its Preview variables and redeploy so photos use the transformer again.
- Keep the **Ignored Build Step** of part B step 5 on this staging project: production is a Vercel project of its own, with its own Ignored Build Step and Production-scoped variables (`docs/runbooks/production-setup.md`, part 1 step 2.2).
- `vercel.json` `git.deploymentEnabled` creates deployments for the `staging` branch only since 2026-10-24, because the Hobby limit of 100 deployments a day was reached by the cancelled builds of every PR push, and for the `production` branch since 2026-10-29, which production builds from (`docs/runbooks/production-setup.md`). Do not add `"main": true`: a merge must never deploy production before its migration.
- Keep the `staging` domain on Preview; production gets its own domain on Production.
- Revisit the Deployment Protection choice of part B for the new team setup.
- Production is migrated only by its own release job (Task P5.7.02), never by this workflow.
