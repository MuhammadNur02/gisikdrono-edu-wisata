# Edu Center & Edu Wisata Kelurahan Gisikdrono

Integrated educational-tourism platform for Kelurahan Gisikdrono, Semarang Barat: promotion, visit reservations and on-site validation for two programmes:

- **RW 05 — Ecowastreme** (ecotourism & environment): zero-waste education, Bank Sampah, composter, maggot farming, urban farming, PKK recycled crafts.
- **RW 08 — Kampung Seni & Budaya** (arts & culture): traditional dance performances, children's art school, traditional Semarang games (dolanan).

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

Every variable is checked at boot by `src/lib/env.ts` and `src/lib/public-env.ts`. Locally, use Midtrans sandbox keys (`SB-Mid-server-…`, `SB-Mid-client-…`) and Cloudflare's Turnstile test keys. `pnpm check` runs lint, typecheck, unit tests and the database type drift check before you push.

`pnpm db:reset` rebuilds the local database from the migrations and then runs `supabase/seed.sql`, which marks it local, writes the development staff accounts below and some demo content (packages, products, sessions, articles). The pg_cron jobs of `0007_cron.sql` run locally too; the ones that call the application stay quiet until you give them Vault secrets (`docs/runbooks/cron.md`).

### Local development accounts

`supabase/seed.sql` creates three staff accounts with a verified TOTP factor. They exist only on your local database and in CI: the seed's first statement refuses any database whose Vault secret `environment` is `staging` or `production`, so these known credentials never reach an online project. They are not in `.env.example` on purpose.

| Email | Role |
|---|---|
| `superadmin@dev.gisikdrono.test` | superadmin |
| `admin-rw05@dev.gisikdrono.test` | admin_rw, RW 05 |
| `admin-rw08@dev.gisikdrono.test` | admin_rw, RW 08 |

- Password (all three): `DEV-ONLY-local-Password-1!`
- TOTP secret (all three): `DEVONLYLOCALTOTPGISIKDRONOSECRET`. Add it once to an authenticator app, or run `pnpm db:seed`, which prints the accounts with the code of this moment and refuses to run against anything but `127.0.0.1`.

## Status

Phase 1 in progress: repository scaffold and quality gates (`docs/Task.md` P1.1).
