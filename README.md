# Edu Center & Edu Wisata Kelurahan Gisikdrono

Integrated educational-tourism platform for Kelurahan Gisikdrono, Semarang Barat: promotion, visit reservations and on-site validation for the programmes of its RWs, which the site reads from the `rw_units` table:

- **RW 05 — Ecowastreme** (ecotourism & environment): zero-waste education, Bank Sampah, composter, maggot farming, urban farming, PKK recycled crafts.
- **RW 13 — Kampung Budaya & Seni** (arts & culture): traditional dance performances, children's art school, traditional Semarang games (dolanan). Until 2026-10-21 the site called it RW 08 Kampung Seni Budaya; its old address redirects here.
- **RW 08 — Kampung Inklusif & Ramah Anak**: the kelurahan's public service centre, with Semar Cakep (an inclusive service for vulnerable groups and people with disabilities) and Ketan Ronggolawe (a child-friendly community hall). A profile page until the kelurahan sets up its packages.

Stack: Next.js (App Router) · Tailwind CSS · shadcn/ui · Framer Motion · Supabase (PostgreSQL, Auth, RLS, Storage) · Midtrans Snap (QRIS + Virtual Account) · Meta WhatsApp Business Cloud API · Resend · PWA camera QR scanner · Vercel.

## Documentation map

| File | Purpose |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Coding context and rules for AI-assisted development (Claude Code / Cursor): conventions, clean-code rules, strict money/webhook/QR/scanner rules, command library |
| [`docs/PRD.md`](docs/PRD.md) | Product Requirement Document: vision, personas, functional & non-functional requirements, database architecture, integration flows |
| [`docs/Task.md`](docs/Task.md) | Work Breakdown Structure and development checklist in five phases |
| [`docs/StyleGuide.md`](docs/StyleGuide.md) | Design system and UI/UX guidelines: tokens, typography, components, dashboard layout, motion |
| [`docs/Security.md`](docs/Security.md) | Security architecture for payments and data: threat model, controls matrix, hardening, incident runbooks, go-live checklist |

Precedence on conflict: `supabase/migrations` > `docs/PRD.md` > `CLAUDE.md` > `docs/Security.md` (security rules are additive) > `docs/StyleGuide.md`.

## Local setup

You need these on `PATH`:

- Node 22 (`.nvmrc`)
- pnpm 10 (pinned in `packageManager`)
- [gitleaks](https://github.com/gitleaks/gitleaks), which the pre-commit hook runs
- the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) with Docker Desktop
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), only for `pnpm tunnel`

```bash
pnpm install --frozen-lockfile
pnpm exec husky         # once per clone: ignore-scripts=true in .npmrc stops the usual prepare hook
pnpm db:start           # local Supabase on http://127.0.0.1:54321 (Studio on :54323)
cp .env.example .env.local
pnpm db:status          # copy the anon and service_role keys into .env.local, then fill in the rest
pnpm dev                # http://localhost:3000
```

Every variable is checked at boot by `src/lib/env.ts` and `src/lib/public-env.ts`. Locally, use Midtrans sandbox keys (`SB-Mid-server-…` / `SB-Mid-client-…` on older sandbox accounts, `Mid-server-…` / `Mid-client-…` on newer ones) and Cloudflare's Turnstile test keys. Because a newer sandbox key looks like a live one, `pnpm midtrans:check` asks the Midtrans sandbox whether it knows your server key; it must say "is a sandbox key". Staging and production keys are checked the same way before they go into Vercel (`docs/Security.md` §3.9). `pnpm check` runs lint, typecheck, unit tests and the database type drift check before you push.

`pnpm db:reset` rebuilds the local database from the migrations and then runs `pnpm db:seed`, which marks it local, writes the development staff accounts below and some demo content: packages, products and sessions for RW 05 and RW 13, a combo of the two, and articles, all marked `DATA CONTOH` in `scripts/seed-dev.sql` because their names, times, capacities and prices are invented for development and are not facts about any real business; and the profiles and activity points of RW 05, RW 13 and RW 08, retold from the kelurahan's own site and still to be confirmed by it (`docs/content/konten-situs-kelurahan.md`). Run `pnpm db:seed` on its own after `pnpm db:start` on a fresh clone; running it again changes nothing. A database seeded before RW 13 existed (Task P2.10.03) holds the arts demo and a development admin under RW 08, so its migration stops there with a list of what ties RW 08 to that programme: run `pnpm db:reset` once after pulling that change. Should old demo rows of RW 08 turn up again, `pnpm db:seed` moves them to RW 13 itself. The pg_cron jobs of `0007_cron.sql` run locally too; the ones that call the application stay quiet until you give them Vault secrets (`docs/runbooks/cron.md`).

The demo content has no photos of its own, so the hero and RW photo slots show the wordless placeholder (a tinted background with an icon). If you have the folder of development photos, `pnpm db:seed --media <folder>` re-encodes the ones `scripts/demo-media.ts` names (WebP, at most 1600 px, metadata removed, the same step `api/uploads/finalize` uses) into the local `public-media` bucket and adds the hero banner and the RW 05 gallery rows, and gives the RW 05 page and its two activity points one of those photos each. The photos stay outside the repository: never copy them into it, into `tests/fixtures` or into a commit, because the consent of the people in them is still being arranged. In the same way `pnpm db:seed --official-media <folder>` uploads the photos of the kelurahan's own site that `scripts/official-media.ts` names, from the folder they were downloaded into with their manifest (`docs/content/konten-situs-kelurahan.md` §4), as gallery rows of RW 05, RW 13 and RW 08, the RW 13 page photo and the photos of three activity points. Both options can be given together; the development photos go first and keep their places.

The public pages are prerendered from the database, so `pnpm build` needs the local stack running (`pnpm db:start`), as CI starts one before its builds. Images are resized by Supabase's own transformer (`[storage.image_transformation]` in `supabase/config.toml`, the Pro plan on staging and production).

### Trying the WhatsApp code locally

No WhatsApp number is needed on your laptop. On `pnpm dev` with the local stack (`src/lib/local-development.ts`: development, no `VERCEL_ENV`, the site and Supabase on `127.0.0.1` or `localhost`), the outbox delivers every message to Mailpit at http://127.0.0.1:54324 instead of Meta and Resend, one-time codes and booking links included. Open http://localhost:3000/dev/otp, type a number, press "Kirim kode", read the code in Mailpit (the mail to `wa<number>@whatsapp.lokal`) and verify it. `/dev/otp` is a `page.dev.tsx`, which only `next dev` serves and no build contains, and it answers 404 on any server that is not local; staging and production never send a code anywhere but WhatsApp or email, and never log one (`docs/Security.md` §4.1).

### Local development accounts

`pnpm db:seed` (`scripts/seed-dev.ts` with `scripts/seed-dev.sql`) creates four staff accounts with a verified TOTP factor. They exist only on your local database and in CI: the script takes its address from `supabase status` and refuses anything but `127.0.0.1`, and its SQL refuses any database whose Vault secret `environment` says anything but `local`, so these known credentials never reach an online project. The Supabase CLI's own seed is switched off, so `supabase db reset` writes no account anywhere. The credentials are not in `.env.example` on purpose.

| Email | Role |
|---|---|
| `superadmin@dev.gisikdrono.test` | superadmin |
| `admin-rw05@dev.gisikdrono.test` | admin_rw, RW 05 |
| `admin-rw13@dev.gisikdrono.test` | admin_rw, RW 13 (the arts programme's account until 2026-10-21 was `admin-rw08`) |
| `admin-rw08@dev.gisikdrono.test` | admin_rw, RW 08 |

- Password (all four): `DEV-ONLY-local-Password-1!`
- TOTP secret (all four): `DEVONLYLOCALTOTPGISIKDRONOSECRET`. Add it once to an authenticator app, or run `pnpm db:seed` again, which prints the accounts with the code of this moment.

## Status

Phase 1 in progress: repository scaffold and quality gates (`docs/Task.md` P1.1).
