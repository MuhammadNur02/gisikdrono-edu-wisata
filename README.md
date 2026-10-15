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

## Status

Documentation phase (v1.0, 2026-10-15). No application code yet; implementation follows `docs/Task.md` Phase 1.
