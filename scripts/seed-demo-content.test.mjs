import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEV_ACCOUNTS } from './dev-accounts.ts';
import { SEEDED_POINT_ESTIMATES, SEEDED_RW_CENTRE_ESTIMATES } from '../src/config/map-estimates.ts';

const demoSql = readFileSync(
  fileURLToPath(new URL('./seed-demo-content.sql', import.meta.url)),
  'utf8',
);

// The SQL of the file with its comments left out and whitespace folded.
const statements = demoSql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

describe('scripts/seed-demo-content.sql', () => {
  it('refuses every database but a local or a staging one before it writes anything', () => {
    expect(statements.startsWith('do $$ begin if internal.environment() is distinct from')).toBe(
      true,
    );
    const guard = statements.slice(0, statements.indexOf('end; $$;'));
    expect(guard).toContain(
      "is distinct from 'local' and internal.environment() is distinct from 'staging'",
    );
    expect(guard).toContain('raise exception');
  });

  it('writes no staff account, Auth row, Vault secret or development credential', () => {
    for (const forbidden of ['auth.', 'public.profiles', 'vault.', 'dev_seed.', 'staff_invites']) {
      expect(statements).not.toContain(forbidden);
    }
    for (const account of DEV_ACCOUNTS) expect(demoSql).not.toContain(account.email);
  });

  it('only adds rows: the cleanup of the old local RW 08 layout stays in seed-dev.sql', () => {
    expect(statements).not.toMatch(/\bdelete from\b/i);
    expect(statements).not.toContain('app.purge');
  });

  it('holds no phone number or email address', () => {
    expect(statements).not.toMatch(/\+62\d{6,}/);
    expect(statements).not.toMatch(/[\w.-]+@[\w-]+\.[\w.]+/);
  });
});

// The estimated map positions (docs/content/konten-situs-kelurahan.md, section 8).
describe('the estimated coordinates of scripts/seed-demo-content.sql', () => {
  const statementList = statements.split(';').map((statement) => statement.trim());
  const coordinateUpdates = statementList.filter(
    (statement) =>
      /^update public\.(activity_points|rw_units)\b/.test(statement) &&
      /\bset (map_)?(lat|lng)\b/.test(statement),
  );
  const pointUpdate = coordinateUpdates.find((statement) =>
    statement.includes('public.activity_points'),
  );
  const centreUpdate = coordinateUpdates.find((statement) => statement.includes('public.rw_units'));

  it('only fill a position nobody has entered: every coordinate update carries the IS NULL guard', () => {
    expect(coordinateUpdates).toHaveLength(2);
    expect(pointUpdate).toMatch(/\w+\.lat is null and \w+\.lng is null$/);
    expect(centreUpdate).toMatch(/\w+\.map_lat is null and \w+\.map_lng is null$/);
  });

  it('equal src/config/map-estimates.ts, which tells the map they are estimates', () => {
    const points = Object.fromEntries(
      [...(pointUpdate ?? '').matchAll(/\((\d+), '([a-z0-9-]+)', (-?[\d.]+), (-?[\d.]+)\)/g)].map(
        ([, rwId, slug, lat, lng]) => [
          slug,
          { rwId: Number(rwId), lat: Number(lat), lng: Number(lng) },
        ],
      ),
    );
    expect(points).toEqual(SEEDED_POINT_ESTIMATES);
    const centres = Object.fromEntries(
      [...(centreUpdate ?? '').matchAll(/\((\d+), (-?[\d.]+), (-?[\d.]+)\)/g)].map(
        ([, rwId, lat, lng]) => [rwId, { lat: Number(lat), lng: Number(lng) }],
      ),
    );
    expect(centres).toEqual(SEEDED_RW_CENTRE_ESTIMATES);
  });
});
