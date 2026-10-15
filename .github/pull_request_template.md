## What changed and why

<!-- Tell the story in a few sentences, the way you would to a colleague (CLAUDE.md §4.2). -->

- Requirement: <!-- FR-* / NFR-* from docs/PRD.md -->
- Task: <!-- P#.#.## from docs/Task.md -->
- Security controls: <!-- e.g. WH-01, AZ-06, or "none" -->

## Definition of done (CLAUDE.md §9.5 and §9.6)

- [ ] PRD requirement ID cited above
- [ ] New tables: migration + RLS (enabled and forced) + grants + policies + pgTAP in this PR; `pnpm db:types` regenerated
- [ ] Server Actions follow the five-step order (validate, guard, service, revalidate, return) and return `ActionResult`
- [ ] No new `admin.ts` importer outside the allow-list; header comment present where allowed
- [ ] Money as integer IDR with snapshots; status and quota written only in `internal.*`
- [ ] State changes recorded in `booking_events` / `audit_logs`
- [ ] Validation schema shared between client and server
- [ ] No new env var without `.env.example` + CLAUDE.md §10.2 registry + `src/lib/env.ts` schema
- [ ] Indonesian copy reviewed; 360 px layout verified; a11y checked
- [ ] Unit and integration tests green; `pnpm check` and `pnpm db:test` green
- [ ] Screenshots attached for UI changes
- [ ] `docs/Task.md` item ticked
- [ ] Preview deployment tested on a phone for scanner or booking changes
