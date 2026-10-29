# Security Tests on Staging

| Field | Value |
|---|---|
| Document | `docs/security-tests.md` |
| Version | 1.0 |
| Date | 2026-10-29 |
| Status | Unauthenticated part run; authenticated part waits for the product owner |
| Owner | Kelurahan Gisikdrono Edu Center project team |
| Tasks | `docs/Task.md` P5.2.02 (manual IDOR / role tests, AZ-08, AZ-03), P5.5.01 (OWASP ZAP baseline, OPS-05) |
| Related documents | `docs/Security.md` §6.9 (isolation tests), §8.2 (headers), §13.1 (go-live checklist); `tests/e2e/security.spec.ts`, `tests/e2e/security-matrix.spec.ts` |

---

## 1. Scope and rules of engagement

- **Target:** the staging deployment only (Vercel Preview, staging Supabase, Midtrans sandbox). Its address is never written into this repository, a commit, a PR, an issue or any outside service (online header checkers, Observatory, scanners): the repository is public. Commands read it from `$STAGING_URL`; scanner output is redacted to paths before it is pasted here.
- **Passive or refusal-only.** The ZAP run is the *baseline* (passive) scan. No active scan, no fuzzing of write endpoints, nothing that creates bookings, OTPs or messages in bulk. A handful of refused requests may raise rate-limit or `webhook_signature_invalid` alerts on staging; that is expected.
- **No credentials in the unauthenticated part.** Nobody signs in, no account is created, no TOTP is entered, no WhatsApp or email is sent, no payment or Midtrans dashboard is touched.
- **Authenticated part (§3, §4) is the product owner's.** It uses the staging test accounts only (one superadmin, one admin_rw for each of RW 05, RW 13 and RW 08), never a production account.
- **Findings** go into the triage table (§5.4) as *real issue* (fixed here, or open), *accepted* (with the rationale) or *false positive*. Anything touching auth, RLS, money or payments is never fixed in passing: it is opened as an issue and closed before P5.7.

## 2. Unauthenticated probe (`pnpm security:probe`)

```bash
# STAGING_URL is a variable of your own shell only; it is never committed or read by the script.
pnpm security:probe -- --url "$STAGING_URL"
# production, after go-live configuration (judges public pages as production's, without noindex):
pnpm security:probe -- --url "$PRODUCTION_URL" --production
```

`scripts/security-probe.ts` asks the deployment, over HTTPS and without any secret, everything a visitor without a session can try. It paces its ~80 requests (150 ms apart), follows no redirect, and prints paths only, never the host, so its output can be pasted below as it is. The base URL comes from `--url` only. Without `--production` the probe first checks that `/` carries `X-Robots-Tag: noindex`, which every preview response does (`next.config.ts`), and refuses to go on when it does not, so a production target is never judged by a preview's rules by mistake. Exit code 1 when a check fails; a `WARN` (a state to review, such as a webhook secret not configured on that deployment) does not fail the run. The expected header values come from `tests/e2e/helpers/expected-headers.ts`, the same list the Playwright security specs use; the pure rules are unit-tested in `scripts/security-probe-rules.test.mjs`.

| Area | What it asserts |
|---|---|
| Dashboard | `/dashboard`, `/dashboard/{bookings,finance,scanner,users,exports}` → 307 to `/login` with `?next=` (none for `/dashboard` itself, `pathWithNext`) |
| Jobs | the six `/api/jobs/*` → 401 without a bearer and with a wrong one |
| Webhooks | `/api/webhooks/midtrans/<random>` → 404; WhatsApp with a bad `X-Hub-Signature-256` → 403; WhatsApp handshake with a wrong verify token → 403; Resend without Svix headers → 403 (503 = secret not configured, reported as `WARN`) |
| Documents | `/api/documents/{quotation,invoice,receipt,ticket,certificate}/<random uuid>` → 401/403/404 and never `application/pdf` |
| Exports | `POST` and `GET /api/export/{visits,attendance,finance,audit}` (same origin, no session) → 401/403 |
| Uploads | `/api/uploads/{sign,sign-pages,finalize}` with a well-formed body and no session → 401 |
| Guest pages | `/reservasi/<random code>`, `/bayar`, `/tiket` → 404 with no phone, email or booking code in the body; `/v/<garbage>` → "Tiket tidak valid", no PII |
| Scanner | `POST /api/tickets/verify` → 401 same-origin without a session, 403 cross-origin |
| Server Actions | a POST with `Next-Action` from another origin, or with none → 403 |
| Headers | `/`, `/dashboard` (the redirect), `/reservasi/x`, `/api/health`, `/login`, `/v/x`: HSTS, `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy (`no-referrer` on `/reservasi`, `/v`), COOP/CORP `same-origin`, `Permissions-Policy: camera=()…`, a CSP of either kind with `frame-ancestors 'none'` and `object-src 'none'`, `X-Robots-Tag: noindex` (every response of a non-production deployment), `Cache-Control: private, no-store` on private routes and `/api` |
| Crawlers | `robots.txt` disallows every private path (or everything, on a preview); `sitemap.xml` lists no private route |
| Build | the first five `/_next/static` chunks of `/` have no served `.map` and no `sourceMappingURL`; `/.env`, `/.env.local`, `/.env.production`, `/.git/HEAD`, `/.git/config`, `/.vercel/project.json`, `/package.json`, `/next.config.ts`, `/supabase/config.toml` → 404; `/_next/image` proxies no outside address |

## 3. Manual IDOR and role test plan (P5.2.02, product owner)

The pgTAP suites (`supabase/tests/rls_*.sql`, `rls_three_rws.sql`) and `pnpm test:rls` already prove the isolation in the database (docs/Security.md §6.9). This session proves it end to end on staging, through the deployed app, PostgREST and Storage, with real staging sessions. Run it in one sitting; fill the **Result** column with `pass`, `FAIL` (and open an issue) or `n/a`.

### 3.1 Preparation

1. Four staging test accounts, each with TOTP enrolled: `SA` (superadmin), `A05` (admin_rw RW 05), `A13` (admin_rw RW 13), `A08` (admin_rw RW 08). Use a separate browser profile (or a private window) per account so cookies never mix.
2. Fixtures, one set per RW, created through the dashboard as that RW's admin (or by `SA`), and their ids noted in a local scratch file, never in the repository: a published package, a product, an article draft, a gallery item, a session, and a paid booking with a ticket (pay in the Midtrans sandbox, or `mark_booking_paid_manually` as `SA`). Note for each booking its `id` (from `/dashboard/bookings/[id]`), its `booking_code`, its ticket id and its invoice id.
3. Guest links: for two bookings `B05` (RW 05) and `B13` (RW 13), keep one link of each scope (`pay`, `manage`, `view`, `review` once completed, `certificate` once certificates are issued) from the staging WhatsApp/email outbox (`notifications` rows, read as `SA` in Supabase Studio) or minted locally with `tests/e2e/helpers/guest-hub.ts` against the staging secret by the owner.
4. A staff access token for the PostgREST/Storage steps: signed in at AAL2, read the `sb-<ref>-auth-token` cookie in DevTools (Application → Cookies), take its `access_token`, and keep it in a shell variable only, typed at a hidden prompt so it never lands in the shell history: `read -rs TOKEN_A05` (paste, Enter). Delete the variables at the end (`unset TOKEN_SA TOKEN_A05 TOKEN_A13 TOKEN_A08`). The anon key is `NEXT_PUBLIC_SUPABASE_ANON_KEY` of staging (public by design); `$SUPABASE_URL` is the staging project URL.

```bash
# PostgREST RPC as a staff member (named arguments as in src/db/types.ts, Functions)
curl -s "$SUPABASE_URL/rest/v1/rpc/<function>" -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_A05" -H 'Content-Type: application/json' -d '{"p_...": "..."}'
# A table or view read
curl -s "$SUPABASE_URL/rest/v1/<table>?select=id&rw_id=eq.13" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A05"
```

Expected refusals: a page answers 404 (or the dashboard's not-found / forbidden state) and shows no foreign data; an API route answers 403 `FORBIDDEN` or 404 `NOT_FOUND`; an RPC raises `42501` or a `P0001` with a `FORBIDDEN` hint; a table read returns `[]`; an update returns `[]` or `42501`. A mutating RPC that unexpectedly succeeds has changed staging data: stop, record it as **Critical**, and open an issue.

### 3.2 Dashboard routes across RWs

Run the whole table three times: as `A05` against RW 13 and RW 08 ids, as `A13` against RW 05 and RW 08, as `A08` against RW 05 and RW 13 ("foreign" below).

| # | Step | Expected | Result A05 | Result A13 | Result A08 |
|---|---|---|---|---|---|
| D1 | Open `/dashboard/bookings/<foreign booking id>` | 404 / not found; no name, phone, code or amount of the foreign booking | | | |
| D2 | Open `/dashboard/packages/<foreign package id>/edit` | 404 / not found | | | |
| D3 | Open `/dashboard/products/<foreign product id>/edit` | 404 / not found | | | |
| D4 | Open `/dashboard/articles/<foreign RW article id>/edit` | 404 / not found | | | |
| D5 | Lists `/dashboard/bookings`, `/sessions`, `/attendance`, `/certificates`, `/galleries`, `/schedules`, `/activity-points`, `/booklets`, `/packages`, `/products`, `/pages` | only own-RW rows; no RW switcher shown | | | |
| D6 | Same lists with a forged `rw_scope` cookie set to a foreign RW id (DevTools → Cookies) | ignored: still own-RW rows only | | | |
| D7 | List filters/search with a foreign RW id or a foreign booking code in the query string (`?rw=`, `?q=GSK-...`) | no foreign row | | | |
| D8 | Superadmin-only pages: `/dashboard/finance/revenue-share`, `/finance/reconciliation`, `/finance/adjustments`, `/users`, `/settings`, `/settings/hero-banners`, `/audit-logs`, `/security-alerts`, `/reviews` | forbidden / not found, no data | | | |
| D9 | `/dashboard/finance` (recap) | own RW only; no other RW's amounts, no combo split of another RW | | | |
| D10 | `/dashboard/scanner`: scan (or paste) a foreign RW ticket's QR in `preview` | `wrong_rw`; no booking details beyond the result; nothing checked in | | | |
| D11 | Manual check-in with a foreign `booking_code` + last-4 | refused (`wrong_rw` / `not_found`), logged `manual_checkin` | | | |
| D12 | Edit an own-RW package and, in DevTools, replay the Server Action with a foreign `rwId` / foreign package id in the payload | `FORBIDDEN` or `NOT_FOUND`; the foreign row is unchanged | | | |
| D13 | Create a gallery item linked to a foreign booking; a schedule linked to a foreign package (replay as in D12) | refused by the trigger guard; nothing created | | | |

### 3.3 Staff RPCs and tables through PostgREST

As each RW admin, with that admin's token, against foreign ids (same rotation as §3.2). Every staff RPC of CLAUDE.md Appendix A.4 that takes an RW-scoped id is here, plus those the database has beyond it (R29). For every call that would write, the expected result also means: the row is unchanged and no `notifications` row was enqueued for that booking (count them as `SA` in Supabase Studio before and after the step). Rows marked **superadmin only** are refused for an admin_rw on their own RW's ids as well: try them with an own-RW id too.

| # | Call | Expected | Result A05 | Result A13 | Result A08 |
|---|---|---|---|---|---|
| R1 | `rpc/rpc_get_participants` `{"p_booking_id": "<foreign booking>"}` | refused or `[]` | | | |
| R2 | `rpc/rpc_reveal_booking_contact` `{"p_booking_id": "<foreign>", "p_reason": "uji isolasi"}` | refused; no contact; no `pii_revealed` event for that booking | | | |
| R3 | `rpc/validate_ticket` with a foreign ticket id, a fresh `p_attempt_id` | `wrong_rw` (or `forbidden`) | | | |
| R4 | `rpc/check_in_ticket` `{"p_ticket_id": "<foreign>", "p_attempt_id": "<new uuid>", "p_attendee_count": 1}` | raises / `wrong_rw`; ticket stays `issued` | | | |
| R5 | `rpc/revoke_ticket` `{"p_ticket_id": "<foreign>", "p_reason": "uji"}` | raises; ticket unchanged | | | |
| R6 | `rpc/issue_certificates` `{"p_booking_id": "<foreign>"}` | raises; no certificate | | | |
| R7 | `rpc/generate_visit_sessions` `{"p_rw_id": <foreign>, "p_from": "<date>", "p_to": "<date>"}` | raises; no session created | | | |
| R8 | `rpc/visit_stats` `{"p_from": "...", "p_to": "...", "p_rw_id": <foreign>}` | refused, or own RW only | | | |
| R9 | `rpc/revenue_recap` with `p_rw_id` foreign | refused, or own RW only | | | |
| R10 | `rpc/cancel_booking`, `rpc/extend_booking_hold`, `rpc/mark_booking_paid_manually` on a foreign booking | raise; booking unchanged | | | |
| R11 | `rpc/set_staff_role` / `rpc/set_staff_status` on any account, including their own | raise (superadmin only, never own row) | | | |
| R12 | `rpc/rpc_create_export` `{"p_kind": "finance", ...}` | raises (admin_rw exports own-RW attendance only) | | | |
| R13 | `GET v_bookings_staff?rw_id=eq.<foreign>`, `booking_legs`, `tickets_qr`, `payments`, `revenue_share_entries`, `visit_sessions` | `[]` | | | |
| R14 | `GET bookings?select=*` and `booking_participants?select=*` | `[]` (no direct SELECT for `authenticated`) | | | |
| R15 | `PATCH tour_packages?id=eq.<foreign>` `{"title": "x"}` (with `Prefer: return=representation`) | `[]` or `42501`; row unchanged | | | |
| R16 | `PATCH profiles?id=eq.<own id>` `{"role": "superadmin"}` and `{"rw_id": <foreign>}` | `42501` | | | |
| R17 | The same as R13 with a token taken at AAL1 (password step only, before TOTP) | `[]` everywhere, including as `SA` | | | |
| R18 | `rpc/undo_check_in` `{"p_ticket_id": "<used ticket>", "p_reason": "uji"}`, **superadmin only** | admin_rw must be refused (foreign and own RW); ticket stays `used` | | | |
| R19 | `rpc/reactivate_booking` `{"p_booking_id": "<foreign expired booking>"}` | refused; booking stays `expired`; no quota reserved; nothing enqueued | | | |
| R20 | `rpc/record_refund` `{"p_booking_id": "<paid booking>", "p_amount": 1000, "p_reason": "uji", "p_reference": "uji"}`, **superadmin only** | admin_rw must be refused; no `payment_adjustments` row; nothing enqueued | | | |
| R21 | `rpc/resolve_booking_review` `{"p_booking_id": "<booking in needs_review>", "p_resolution": "...", "p_reason": "uji"}`, **superadmin only** | admin_rw must be refused; booking and payment unchanged | | | |
| R22 | `rpc/revoke_certificate` `{"p_certificate_id": "<certificate>", "p_reason": "uji"}`, **superadmin only** | admin_rw must be refused; certificate stays `issued` | | | |
| R23 | `rpc/request_notification_resend` `{"p_booking_id": "<foreign>", "p_channel": "whatsapp", "p_template": "payment_received_ticket"}` | refused; **no** new `notifications` row; nothing sent | | | |
| R24 | `rpc/settle_revenue_entries` (any beneficiary of a foreign RW, `p_from`/`p_to`, `p_expected_total`, `p_reference`, `p_proof_path`), **superadmin only** | admin_rw must be refused; no `payout_batches` row; ledger unchanged | | | |
| R25 | `rpc/propose_adjustment` `{"p_booking_id": "<paid booking>", "p_type": "write_off", "p_amount": 1000, "p_reason": "uji", "p_evidence_path": "bookings/<id>/x.pdf"}`, **superadmin only** | admin_rw must be refused; no `payment_adjustments` row | | | |
| R26 | `rpc/approve_adjustment` and `rpc/reject_adjustment` `{"p_id": "<a proposed adjustment>"}`, **superadmin only** | admin_rw must be refused; status stays `proposed` | | | |
| R27 | `rpc/apply_adjustment` `{"p_id": "<an approved adjustment>"}`, **superadmin only** | admin_rw must be refused; status stays `approved`; ledger unchanged | | | |
| R28 | `rpc/reset_staff_mfa` `{"p_user_id": "<another staff member>"}` (and their own id), **superadmin only** | admin_rw must be refused; the factor is untouched | | | |
| R29 | The RW-scoped RPCs beyond Appendix A.4 (arguments in `src/db/types.ts`): `create_admin_booking`, `send_admin_booking_link`, `cancellation_preview`, `declare_weather_disruption`, `find_manual_ticket`, `scan_ticket`, `unlock_scanner_officer`, `save_package` / `save_package_legs` / `save_package_tiers`, `rpc_get_addon_notes`, `finance_booking`, `get_rw_treasury_account` / `set_rw_treasury_account`, `get_vendor_bank_account` / `set_vendor_bank_account`, `set_rw_unit_status`, each with a foreign RW, booking, package or vendor id | refused or empty; nothing written; nothing enqueued; no account number shown | | | |
| R30 | Any `svc_*` function (for example `rpc/svc_enqueue_notification`, `rpc/svc_create_booking`) with a staff token | `42501` permission denied (service role only) | | | |

### 3.4 Storage prefixes

| # | Step (as each RW admin) | Expected | Result A05 | Result A13 | Result A08 |
|---|---|---|---|---|---|
| S1 | In the app, `POST /api/uploads/sign` with a foreign `rwId` (replay an own upload in DevTools, change `rwId`) | 403 `FORBIDDEN` | | | |
| S2 | `POST /api/uploads/finalize` with a foreign `uploads-quarantine` path (`rw-XX/<uuid>` of another RW) | refused; nothing moved | | | |
| S3 | Storage REST: `POST $SUPABASE_URL/storage/v1/object/list/uploads-quarantine` `{"prefix": "rw-<foreign>/"}` with the admin's token | `[]` or 400/403 (no client policy) | | | |
| S4 | Storage REST: list and `GET .../object/authenticated/documents/bookings/<foreign booking id>/...` | 400/403/404; no file | | | |
| S5 | Storage REST: `PUT`/`DELETE` into `public-media/rw-<foreign>/...` and `public-media/rw-<own>/...` | refused both (only `finalize` writes public-media) | | | |
| S6 | `GET .../object/public/public-media/../documents/...` (path traversal) | 400/404 | | | |

### 3.5 Guest links across scopes and bookings

No staff session for these steps (a fresh private window).

| # | Step | Expected | Result |
|---|---|---|---|
| G1 | Open `B05`'s `view` link, then go to `/reservasi/<B13 code>` in the same window | 404 for `B13`; `B05`'s cookie is path-bound to `/reservasi/<B05 code>` | |
| G2 | Rewrite `B05`'s link to `/reservasi/<B13 code>?t=<B05 token>` | 404; no cookie set for `B13` | |
| G3 | With `view` only: try cancel, invoice, participants, revoke-links on `B05` | refused (needs `manage`) | |
| G4 | With `pay`: open `/reservasi/<code>/tiket` and `/sertifikat` | refused (scope) | |
| G5 | `review` link before the booking is `completed`; a second review with the same link | refused; single use | |
| G6 | `certificate` link without the last-4 step, then with a wrong last-4 five times | no participant names; the sixth try is locked (`certificate_phone:booking`) and a `certificate_phone_locked` alert appears | |
| G7 | Tamper one character of a token's signature; use an expired one | 404 for both | |
| G8 | "Cabut tautan" (revoke links) with `manage`, then reuse the old `view` link and the old cookie | 404; cookie deleted | |
| G9 | `/reservasi/cari` with `B05`'s code and `B13`'s phone | only "link re-sent" copy; no data shown, nothing sent to the wrong number | |

### 3.6 `/api/documents/*` with foreign ids

| # | Step | Expected | Result |
|---|---|---|---|
| P1 | As `A05`: `/api/documents/invoice/<B13 invoice id>`, `receipt`, `quotation`, `ticket/<B13 booking id>`, `certificate/<B13 certificate id>` | 403/404, never a PDF | |
| P2 | As a guest holding `B05`'s cookie: the same URLs with `B13`'s ids | 403/404, never a PDF | |
| P3 | As a guest holding `B05`'s cookie: `B05`'s participant-bearing certificate without the last-4 proof | refused | |
| P4 | As `SA` at AAL1 (before TOTP): `B05`'s invoice | refused | |

### 3.7 `/api/export/*` as admin_rw

| # | Step | Expected | Result |
|---|---|---|---|
| X1 | As `A05`, from `/dashboard/exports`: attendance of RW 05 | allowed; contact columns absent; watermark present; link valid 300 s | |
| X2 | As `A05`, replay X1 with the RW filter set to 13 (DevTools) | 403 / `FORBIDDEN`; no file | |
| X3 | As `A05`: `POST /api/export/visits`, `/finance`, `/audit` | 403 `FORBIDDEN` | |
| X4 | As `A05`: `GET /api/export/attendance?id=<an export id of A13 or SA>` | 404 | |
| X5 | As `A05`: open X1's download link after 300 s; after 24 h | expired; file deleted after 24 h | |
| X6 | As `SA`: eleven exports within an hour | the eleventh is 429 | |

## 4. Authenticated ZAP context (P5.5.01, product owner)

The authenticated scan stays **passive** and **manual**: ZAP proxies a browser session and its passive rules read what passes. No active scan rule and **no spider** (neither the traditional nor the AJAX spider) runs against staging while signed in: a spider drives the pages like a user, so it fires Server Actions and can press *Simpan*, *Arsipkan*, *Batalkan*, deactivate a staff member (`set_staff_status`) and the like, which changes data. A spider of a signed-in session may only run against a local stack (`pnpm db:start` + `pnpm build && pnpm start` on `127.0.0.1`). The unauthenticated baseline of §5.3 is the one spider allowed on staging: it carries no session, so it reaches public pages and refusals only.

> **Warning.** During the session, click no button that saves, archives, cancels, refunds, revokes, sends, approves or changes a staff member. Open pages, lists, detail views, filters and dialogs only, and close a dialog with *Batal* or Escape. If a page cannot be covered without a write, do that write only on a dedicated test record created for this session, and note it in §5.4.

1. On the owner's machine: `docker pull ghcr.io/zaproxy/zaproxy:stable`.
2. Start ZAP with its UI (or the desktop install) and its proxy on `127.0.0.1:8080`; in *Options → Scan rules / Active Scan* nothing is needed, as no active scan is started.
3. Create a context `staging-dashboard` including `$STAGING_URL/dashboard.*` and `$STAGING_URL/api/.*`, excluding `.*/auth/signout.*`, `.*/api/webhooks/.*` and `.*/api/jobs/.*`. Under *Options → Passive Scan Rules* keep the defaults; start nothing from *Attack* or *Spider*.
4. Set the context's *Session management* to *Cookie-based*. Sign in **manually** in a browser proxied through ZAP (password, then TOTP) as the staging test superadmin; ZAP keeps the `sb-*` cookies. Do not store the password or the TOTP secret in ZAP.
5. Browse by hand, through the proxy, every dashboard page of `src/config/nav.ts` once, read-only as the warning above says: open each list, one detail page of each kind (booking, package, product, article), the filters and the *Tambah* / edit sheets without saving them. Do not start a spider.
6. Repeat 4–5 as one RW admin (`A05`), so the admin_rw pages and their headers are covered.
7. Export *Report → Generate report* (Traditional HTML and JSON) to a folder outside the repository. Before anything goes into this file, redact the host (replace it with `$STAGING_URL`) and drop request/response bodies.
8. Add each alert to §5.4 with its triage. Sign out in the browser and delete the ZAP session file afterwards (it holds the session cookies).

## 5. Results log

### 5.1 2026-10-29: what ran

| Item | Ran | Notes |
|---|---|---|
| `pnpm security:probe` against staging (unauthenticated) | yes, twice | run 1: 46 passed, 7 failed (one real finding, F-01; two webhook 503s, now reported as `WARN`, F-02; four from the probe's own expectations, corrected); run 2 in §5.2 |
| ZAP baseline, `zap-baseline.py -m 3` (unauthenticated, passive) | **no** | the Docker engine answered, but the pull of `ghcr.io/zaproxy/zaproxy:stable` stalled twice (every missing layer stayed at "Pulling fs layer", for over 50 minutes and then for 9 minutes on the retry); see §5.3 |
| Manual IDOR / role session (§3) | no | waits for the product owner (needs staff sign-in) |
| Authenticated ZAP context (§4) | no | waits for the product owner (needs staff sign-in) |

### 5.2 Probe, run 2

```text
PASS  GET /dashboard without a session goes to /login
PASS  GET /dashboard/bookings without a session goes to /login
PASS  GET /dashboard/finance without a session goes to /login
PASS  GET /dashboard/scanner without a session goes to /login
PASS  GET /dashboard/users without a session goes to /login
PASS  GET /dashboard/exports without a session goes to /login
PASS  POST /api/jobs/anomaly-scan without or with a wrong bearer is a 401
PASS  POST /api/jobs/expire-bookings without or with a wrong bearer is a 401
PASS  POST /api/jobs/payments-poll without or with a wrong bearer is a 401
PASS  POST /api/jobs/process-notifications without or with a wrong bearer is a 401
PASS  POST /api/jobs/purge-storage without or with a wrong bearer is a 401
PASS  POST /api/jobs/reconcile-payments without or with a wrong bearer is a 401
PASS  POST the Midtrans webhook under a random path token is a 404
WARN  POST the WhatsApp webhook with a bad signature is a 403
        ~ 503: the signing secret is not configured here, so the 403 was never reached
PASS  GET the WhatsApp handshake with a wrong verify token is a 403
WARN  POST the Resend webhook without a Svix signature is a 403
        ~ 503: the signing secret is not configured here, so the 403 was never reached
PASS  GET /api/documents/quotation/<random uuid> without auth serves no PDF
PASS  GET /api/documents/invoice/<random uuid> without auth serves no PDF
PASS  GET /api/documents/receipt/<random uuid> without auth serves no PDF
PASS  GET /api/documents/ticket/<random uuid> without auth serves no PDF
PASS  GET /api/documents/certificate/<random uuid> without auth serves no PDF
PASS  POST and GET /api/export/visits without a session are refused
PASS  POST and GET /api/export/attendance without a session are refused
PASS  POST and GET /api/export/finance without a session are refused
PASS  POST and GET /api/export/audit without a session are refused
PASS  POST /api/uploads/sign without a staff session is a 401
PASS  POST /api/uploads/sign-pages without a staff session is a 401
PASS  POST /api/uploads/finalize without a staff session is a 401
PASS  GET /reservasi/<random code> is a 404 with no data
PASS  GET /reservasi/<random code>/bayar is a 404 with no data
PASS  GET /reservasi/<random code>/tiket is a 404 with no data
PASS  GET /v/<garbage token> shows invalid and no PII
PASS  POST /api/tickets/verify without a session is refused
PASS  a Server Action POST from another origin, or with none, is a 403
PASS  headers of /  [status 200, CSP report-only]
PASS  headers of /dashboard  [status 307, CSP report-only]
PASS  headers of /reservasi/x  [status 404, CSP report-only]
FAIL  headers of /api/health  [status 200, CSP none]
        - permissions-policy does not start with camera=()
        - no Content-Security-Policy of either kind
PASS  headers of /login  [status 200, CSP report-only]
PASS  headers of /v/x  [status 200, CSP report-only]
PASS  robots.txt disallows the private paths
PASS  sitemap.xml lists no private route
PASS  no source maps under /_next/static  [5 chunks checked]
PASS  GET /.env is a 404
PASS  GET /.env.local is a 404
PASS  GET /.env.production is a 404
PASS  GET /.git/HEAD is a 404
PASS  GET /.git/config is a 404
PASS  GET /.vercel/project.json is a 404
PASS  GET /package.json is a 404
PASS  GET /next.config.ts is a 404
PASS  GET /supabase/config.toml is a 404
PASS  the image optimiser proxies no outside address

50 passed, 2 warned, 1 failed, 53 checks
```

The one failure is finding F-01 (§5.4), fixed in the same PR; it passes once staging is redeployed from it. Of run 1's other failures, the WhatsApp and Resend 503s are F-02, now a `WARN`; the four left were the probe's own expectations, corrected before run 2: `/dashboard` itself carries no `?next=` by design (`pathWithNext`); a `.map` file under `/_next/static` answers 403 on Vercel, not 404 (no map is served either way, and no chunk names one); and `/api/uploads/{sign-pages,finalize}` validate the body before the session check, as every staff route handler does through `readStaffRequest` (`src/lib/utils/staff-request.ts`, CLAUDE.md §5.4), so the probe now sends a well-formed body and gets the 401.

### 5.3 ZAP baseline (unauthenticated, passive)

Not run on 2026-10-29: the image could not be pulled on the lane machine (§5.1). To run it on a machine whose Docker can pull the image:

```bash
docker pull ghcr.io/zaproxy/zaproxy:stable
mkdir -p ~/zap-out   # outside the repository
docker run --rm -v "$HOME/zap-out:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "$STAGING_URL" -m 3 -r baseline.html -J baseline.json -I
```

`-m 3` caps the spider at three minutes; `-I` keeps warnings from failing the run, since every alert is triaged here. Before pasting, replace the host with `$STAGING_URL` and keep only the alert name, its risk, its count and the affected paths. Two alerts are expected and already triaged in §5.4: a report-only CSP on every page (F-03) and missing CSP / Permissions-Policy on the API routes the middleware skips (F-01, gone after redeploy). Every other alert gets a new row with severity, decision and rationale; every medium+ one is fixed or accepted in writing before P5.7.

### 5.4 Triage

| ID | Finding | Source | Severity | Decision | Rationale or fix |
|---|---|---|---|---|---|
| F-01 | `/api/health`, `/api/jobs/*` and `/api/webhooks/*` send no CSP and no Permissions-Policy: the middleware, which adds both, does not run on them (its matcher) | probe | Low | **Real issue, fixed** in this PR | `src/config/machine-routes.ts` + `next.config.ts` send `Content-Security-Policy: default-src 'none'; object-src 'none'; frame-ancestors 'none'` (enforced on every deployment: these routes answer JSON, text or nothing, so nothing can break) and the closed Permissions-Policy. The middleware matcher now excludes exactly those paths and their sub-paths (`api/health(?:/|$)` and so on), so a look-alike such as `/api/healthz` still gets the middleware's headers. Tests: `src/lib/csp.test.ts` (no drift from `permissionsPolicyFor`), `src/middleware.test.ts` (the matcher skips every machine route and nothing else), `scripts/security-probe-rules.test.mjs` (the headers pass the probe's own rules), `tests/e2e/security.spec.ts` (headers on the health check, a job and a webhook). Re-run the probe after staging redeploys. |
| F-02 | WhatsApp and Resend webhooks answer 503, not 403, to a bad or missing signature | probe | Info | **Accepted on staging**; go-live check | `WHATSAPP_APP_SECRET` and `RESEND_WEBHOOK_SECRET` are not set on staging, so the routes fail closed with 503 before reading a signature (CLAUDE.md §5.4: transient, the provider retries). Nothing is processed. Production must answer 403: run the probe with `--production` against production after go-live config (docs/Security.md §13.1) and expect no `WARN`. |
| F-03 | The CSP is `Content-Security-Policy-Report-Only` on every page | probe | Info | **Accepted by design** | Staging is a Vercel preview, where `cspHeaderNameFor` (`src/lib/csp.ts`) reports instead of enforcing (docs/Security.md §8.2, Task P5.4.01). Production and CI enforce it; the e2e suite checks the enforced policy. |
| F-04 | `/api/uploads/{sign,sign-pages,finalize}` answer 400 with field errors to an anonymous malformed body, before the session check | probe run 1 | Info | **Accepted** | Staff route handlers open with `readStaffRequest` (`src/lib/utils/staff-request.ts`): same Origin, body cap and schema first, then the route's guard (CLAUDE.md §5.4). The field names are the public schema of an open-source repository; no data is read and nothing is written; a well-formed anonymous body gets 401. Changing the order touches auth, so it would be a separate decision. |
| F-05 | `.map` requests under `/_next/static` answer 403 rather than 404 | probe run 1 | Info | **False positive** | Vercel refuses `.map` files; the build sets `productionBrowserSourceMaps: false` and no chunk carries `sourceMappingURL`. |
| F-06 | `/dashboard` redirects to `/login` without `?next=` | probe run 1 | Info | **False positive** | `pathWithNext` drops `next` when it is the dashboard itself, where signing in leads anyway (`src/lib/utils/staff-paths.ts`). |

### 5.5 Open items

| Item | Owner | Before |
|---|---|---|
| Run the unauthenticated ZAP baseline (§5.3) and triage its alerts in §5.4 | Dev or product owner | P5.7 |
| Run §3 (manual IDOR / role) and fill the result columns; open an issue per `FAIL` | Product owner | P5.7 |
| Run §4 (authenticated ZAP context) and add its alerts to §5.4 | Product owner | P5.7 |
| Re-run `pnpm security:probe -- --url "$STAGING_URL"` after staging redeploys with F-01's fix; expect only the two `WARN`s of F-02 | Dev | merge of this PR |
| Run `pnpm security:probe -- --url "$PRODUCTION_URL" --production` once production's secrets are set; expect no `FAIL` and no `WARN` | Dev | P5.7 go-live |
