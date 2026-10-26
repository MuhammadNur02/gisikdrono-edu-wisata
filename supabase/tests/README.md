# pgTAP suites

`pnpm db:test` runs every `*.sql` file here against the stack `supabase start` runs (`supabase test db`). Each file
opens a transaction and rolls it back, so a suite leaves the database as it found it.

## The per-table rule (CLAUDE.md §6.4, docs/Security.md AZ-08)

A migration that creates a table in `public` merges only with a pgTAP file here that covers it, in the same pull
request. The test proves at least:

- RLS is enabled and forced on the table;
- `anon` and `authenticated` have only the grants the table needs, and nothing more;
- one RW's admin sees and writes none of another RW's rows (RW 05, RW 08 and RW 13 against each other), and the
  superadmin's access needs AAL2;
- the money, status and personal-data columns are written only where docs/PRD.md §8 says they are.

`pnpm check:table-tests` (`scripts/check-table-tests.mjs`, in `pnpm check` and in CI's `check` job) fails when a table
created by a migration is named in no file here outside a comment. The files in `helpers/` build fixtures and do not
count.

## The RLS suites

The `rls_*.sql` files are the isolation matrix:

| File | What it covers |
|---|---|
| `rls_enumeration.sql` | Every table has RLS enabled and forced, and every function is executable only by the roles on its allow-list |
| `rls_hygiene.sql` | The withheld columns and the policy rules |
| `rls_matrix_*.sql` | Table by table: what anon, each RW admin and the superadmin (AAL1 and AAL2) may read and write |
| `rls_three_rws.sql` | RW 05, RW 08 and RW 13 against each other |
| `rls_content_writes.sql`, `rls_storage.sql`, `rls_onboarding_persona.sql` | Content writes, storage prefixes, and the onboarding persona |

`pnpm test:rls` runs them together with `tests/integration/rls-http.test.ts`, which repeats the core of the matrix
through PostgREST and Storage with real tokens minted by the stack's own access-token hook: the anon key, the RW 05,
RW 08 and RW 13 admins at AAL2, and the superadmin at AAL1 and at AAL2. CI's `rls` job runs it and is a required
status check on `main` (Task P5.2.01).

The personas of the SQL suites (`admin_rw_05`, `admin_rw_08`, `admin_rw_13`, `superadmin_aal1`, `superadmin_aal2`,
`superadmin_stale_totp`, …) live in `helpers/rls_personas.psql`. A suite includes it with
`\ir helpers/rls_personas.psql` and switches with `select pg_temp.act_as('<persona>')`.
