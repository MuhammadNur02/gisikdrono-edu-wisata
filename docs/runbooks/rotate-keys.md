# Runbook: rotating a secret

Owner: Dev on call; Midtrans and Meta steps by the account owner (the kelurahan head), since developers hold no key access there. Source of truth: `docs/Security.md` §3.9 (Midtrans), §8.5 (secrets registry), §9.1 (QR keys). Rehearsed on staging once before go-live (Task P5.5.03), then yearly.

Use this page for a planned rotation, and for an unplanned one from `docs/runbooks/key-leak.md`. Each section says what breaks while the rotation is under way, so you can pick the moment (02:00 WIB is the quietest).

## Before any rotation

1. Know the environment: **Production** (`gisikdrono-prod`, Vercel environment Production) or **staging** (`gisikdrono-staging`, Vercel environment Preview, branch `staging`). Never copy a value from one to the other.
2. Generate new random values on your own machine, never in a chat or an issue:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

3. Store the new value in the Bitwarden organisation vault first, under the item named after the variable and the environment.
4. Vercel: **Project → Settings → Environment Variables**, find the variable, **Edit**, paste, keep **Sensitive** on, keep the scope to the one environment. A change only takes effect on the next deployment: **Deployments → the latest Production (or staging) deployment → ⋯ → Redeploy** (leave "use existing build cache" off).
5. After the redeploy, record the rotation in Supabase **SQL Editor** of the same project (never the key itself):

   ```sql
   insert into public.security_events (event_type, severity, entity_type, entity_id, details)
   values ('key_rotated', 'info', 'secret', '<VARIABLE_NAME>',
           jsonb_build_object('kid', '<kid or null>', 'operator', '<your name>', 'reason', '<planned | leak>'));
   ```

## Midtrans Server Key (`MIDTRANS_SERVER_KEY`) and webhook path token

Breaks meanwhile: nothing, thanks to the 15-minute overlap.

1. Midtrans dashboard (owner account) → **Settings → Access Keys** → regenerate the Server Key. The old key stops working at Midtrans at once, but notifications already signed with it can still arrive for a few minutes.
2. Run the key check from `docs/Security.md` §3.9 with the new key in a git-ignored file: `pnpm midtrans:check -- --file .env.midtrans-production` must say "is a production key" (staging: "is a sandbox key"). A 401 means stop: the key is wrong or from the other environment.
3. Vercel: set `MIDTRANS_SERVER_KEY_PREVIOUS` to the old value and `MIDTRANS_SERVER_KEY` to the new one. Generate a new `MIDTRANS_WEBHOOK_PATH_TOKEN` too (it rotates with the key). Redeploy.
4. Midtrans → **Settings → Payment → Notification URL** (older dashboards: **Settings → Configuration**): set `https://<domain>/api/webhooks/midtrans/<new path token>` and save.
5. After 15 minutes: delete `MIDTRANS_SERVER_KEY_PREVIOUS` in Vercel and redeploy. Delete the key file from your machine.
6. Check: `select reason, count(*) from public.webhook_rejections where received_at > now() - interval '1 hour' group by reason;` shows no growing `signature_invalid` or `path_token_invalid` after step 4. Run the nightly reconciliation by hand if it exists yet (`POST /api/jobs/reconcile-payments`, Task P3.8.04).
7. Record `key_rotated` for `MIDTRANS_SERVER_KEY` and `MIDTRANS_WEBHOOK_PATH_TOKEN`.

## Supabase service role (`SUPABASE_SERVICE_ROLE_KEY`)

Breaks meanwhile: every webhook, job, guest flow and upload until the redeploy finishes (a few minutes). Do it at 02:00 WIB unless it leaked.

- **Projects on the new API keys** (`sb_secret_…`): Supabase → **Project Settings → API Keys → Secret keys → Create new secret key**. Put it in Vercel `SUPABASE_SERVICE_ROLE_KEY`, redeploy, confirm a job ran (`select job, last_success_at from public.job_heartbeats order by last_success_at desc;`), then **delete** the old secret key on the same page. Two keys live side by side, so nothing breaks.
- **Projects on the legacy keys** (`service_role` JWT, what staging uses today, `docs/runbooks/staging-setup.md`): the only way to retire a leaked `service_role` key is **Project Settings → JWT Keys → rotate the JWT secret** (or migrate to the new keys above). That also changes `anon` and signs every staff member out. Update `SUPABASE_SERVICE_ROLE_KEY` **and** `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel, redeploy (the public key is built into the bundle, so a full rebuild), and tell staff they must sign in again. Prefer moving to the new keys at the same time.

Record `key_rotated` for `SUPABASE_SERVICE_ROLE_KEY`.

## QR signing keys (`QR_SIGNING_KEYS`, `QR_SIGNING_ACTIVE_KID`)

`QR_SIGNING_KEYS` is a JSON map `{ "k1": "<base64 32 bytes>" }`; `tickets_qr.key_id` records which kid signed each ticket.

**Planned rotation** (breaks nothing):

1. Generate a value for the next kid (`k2`, then `k3`; never reuse a kid name).
Before step 2, add the new kid to the database's allow-list, which an RW admin's cash at the counter is held against (`mark_booking_paid_manually`, Task P4.3.10): `update public.site_settings set value = value || '["k2"]'::jsonb where key = 'qr.signing_kids';` as the superadmin. Until it is there, cash is refused with "the QR key id is not one tickets are signed with". Remove a retired kid from the list in step 4.
2. Vercel: `QR_SIGNING_KEYS` = `{ "k1": "<old>", "k2": "<new>" }`, `QR_SIGNING_ACTIVE_KID` = `k2`. Redeploy. New tickets carry `k2`; old ones still verify with `k1`.
3. Find the day `k1` may go: 30 days after the last visit it signed.

   ```sql
   select max(valid_on) + 30 as retire_k1_on from public.tickets_qr where key_id = 'k1';
   ```

4. On that day remove `k1` from the JSON and redeploy. Record `key_rotated` with `kid` = `k2`.

**Leaked kid** (a forged ticket for any future visit is possible):

1. Do steps 1–2 above at once, then remove the leaked kid from `QR_SIGNING_KEYS` in the same edit and redeploy. Every ticket it signed now scans as `invalid_signature`.
2. List the visits it affects and tell each RW admin; until those tickets are issued again (there is no reissue tool yet), the gate checks those groups in by **manual check-in** (booking code + last 4 digits of the verified phone, today only, `docs/Security.md` §9.3):

   ```sql
   select t.ticket_code, t.rw_id, t.valid_on, b.booking_code
   from public.tickets_qr t join public.bookings b on b.id = t.booking_id
   where t.key_id = '<leaked kid>' and t.status = 'issued' and t.valid_on >= public.today_jkt()
   order by t.valid_on;
   ```

## Guest-link secret (`BOOKING_LINK_SECRET`)

Breaks: every guest link and every `bk_<code>` cookie at once. Visitors ask for a new link at `/reservasi/cari` (the WhatsApp and email they verified receive it). Do it in the evening, never on a morning with visits, unless it leaked.

1. Vercel: new `BOOKING_LINK_SECRET`, redeploy.
2. To void the links of **one** booking instead (a forwarded link, a lost phone), no rotation is needed:

   ```sql
   select internal.revoke_guest_links(id) from public.bookings where booking_code = 'GSK-XXXXXXXX';
   ```

3. Record `key_rotated`.

## `CRON_SECRET`

Lives in two places that must match: Vercel and the Supabase Vault (`cron_secret`), `docs/runbooks/cron.md`. Breaks: application jobs answer 401 between the two changes, so keep them minutes apart.

1. Vercel: new `CRON_SECRET`, redeploy, and wait for **Ready**.
2. Immediately, in the SQL Editor of the matching project:

   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new value>');
   ```

3. Within 10 minutes `select job, last_success_at, last_error_code from public.job_heartbeats where kind = 'application';` shows fresh successes. A few `cron_failed` rows from the gap are expected; `/api/health` turns green again by itself.
4. Record `key_rotated`.

## OTP pepper (`OTP_PEPPER`)

Lives in Vercel and the Vault (`otp_pepper`). Breaks: every OTP not yet entered (the visitor asks for a new one), the per-IP correlation of `security_events.ip_hash`, and lockout counting restarts.

1. Vercel: new `OTP_PEPPER`, redeploy.
2. SQL Editor: `select vault.update_secret((select id from vault.secrets where name = 'otp_pepper'), '<new value>');`
3. Record `key_rotated`. Note the time in the incident or review notes: `ip_hash` values before and after cannot be compared.

## The others

| Variable | Where it is changed | Then |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Settings → **Users → System users** → the system user → **Generate new token** (permission `whatsapp_business_messaging` only), then revoke the old one on the same page | Vercel, redeploy, `pnpm wa:send-test -- --to <kelurahan test number> --template gsk_otp_v1` |
| `WHATSAPP_APP_SECRET` | Meta for Developers → the app → **App settings → Basic → App secret → Reset** | Vercel, redeploy |
| `RESEND_API_KEY` | Resend → **API Keys** → create (sending access, this domain only), then delete the old one | Vercel, redeploy |
| `TURNSTILE_SECRET_KEY` | Cloudflare → **Turnstile** → the widget → **Rotate secret key** (the old one keeps working during Cloudflare's grace period) | Vercel, redeploy |
| `PARTICIPANT_PII_KEYS` | new kid, like the QR keys | not used yet (should) |

Every row ends with a `key_rotated` record.
