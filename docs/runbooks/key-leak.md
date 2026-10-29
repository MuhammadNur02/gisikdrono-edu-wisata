# Runbook: a secret has leaked

Owner: Dev on call; the kelurahan head for Midtrans and Meta. Source of truth: `docs/Security.md` §8.5, §11.4. How to rotate each value: `docs/runbooks/rotate-keys.md`.

A secret has leaked when it was seen anywhere outside Vercel, the Supabase Vault and Bitwarden: pasted in a chat, an issue, a commit, a screenshot, a log, a laptop that was lost, or flagged by gitleaks or GitHub push protection. Treat "maybe" as yes.

## 1. First 15 minutes: name it and stop the bleeding

1. Write down, in the incident note: which variable, which environment, where it was seen, and the earliest moment it could have been seen (the exposure window starts there).
2. Rotate it now with `docs/runbooks/rotate-keys.md`, ahead of every other step. Order when several leaked: `SUPABASE_SERVICE_ROLE_KEY` → `MIDTRANS_SERVER_KEY` (+ path token) → `QR_SIGNING_KEYS` kid → `CRON_SECRET` → `BOOKING_LINK_SECRET` → `OTP_PEPPER` → the rest. A leaked `PRODUCTION_DEPLOY_KEY` (the deploy key that moves `production`): delete it in **Settings** > **Deploy keys** at once, then see "The production deploy key" in `docs/runbooks/rotate-keys.md`, and check **Rulesets** > `production` > **Insights** and the repository's branches and tags for pushes it made.
3. Leaked in a git commit: rotating is the fix; rewriting history is not (forks and caches keep it). Close the GitHub secret-scanning alert as "revoked" after rotation.
4. Leaked from a person's account or laptop: also run `docs/runbooks/account-takeover.md` for that person.

## 2. Look for misuse inside the window

Run in Supabase **SQL Editor** of the affected project, with `<since>` = the start of the window.

| Leaked | What misuse looks like | Query |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | writes no person made, tickets without money | `select occurred_at, actor_role, action, entity_type, entity_id from public.audit_logs where occurred_at > '<since>' and actor_role = 'service' order by occurred_at;` plus Supabase **Logs → API** filtered to the `service_role` role, by IP |
| `MIDTRANS_SERVER_KEY` | forged notifications (still stopped by the Status API re-check) | `select received_at, order_id, source, transaction_status, processing_result from public.payment_events where received_at > '<since>' order by received_at;` and compare each settlement with the Midtrans dashboard **Transactions** list |
| `QR_SIGNING_KEYS` | scans of tickets that do not exist | `select scanned_at, result, rw_id from public.ticket_scans where scanned_at > '<since>' and result in ('not_found', 'invalid_signature') order by scanned_at;` |
| `CRON_SECRET` | job runs at odd times | Vercel **Logs**, filter `/api/jobs/`, look for callers that are not the Supabase egress IPs |
| `BOOKING_LINK_SECRET` | bookings opened from many IPs | `select occurred_at, event_type, details from public.security_events where occurred_at > '<since>' and event_type in ('rate_limited', 'turnstile_failed') order by occurred_at;` |

Also read every `security_alerts` row created since `<since>`: `select first_seen_at, last_seen_at, severity, rule, title, occurrences, acknowledged_at from public.security_alerts where last_seen_at > '<since>' order by first_seen_at;`.

## 3. Decide

- Any sign that personal data was read or exported (bookings, phones, participants) → `docs/runbooks/breach.md` now; its 3 × 24 h clock started when you learned of it.
- Any ticket issued without money → `docs/runbooks/r2-ticket-no-money.md`.
- Nothing found → record that the window was searched and with which queries.

## 4. Close

1. `key_rotated` rows exist for every rotated value (rotate-keys.md, "Before any rotation", step 5).
2. Post-mortem within 5 working days: how it leaked, why no control stopped it, the one change that prevents a repeat (a gitleaks rule, a removed log line, a narrower vault share).
