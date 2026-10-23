import { describe, expect, it } from 'vitest';

import {
  budgetFor,
  checkBuildLog,
  DASHBOARD_BUDGET_KB,
  FORMS_BUDGET_KB,
  missingAnchors,
  overBudget,
  PUBLIC_BUDGET_KB,
  readRows,
} from './check-first-load-budget.mjs';

// A `next build` route table as Next.js 15 prints it, with the rows the gate must skip.
const TABLE = `
Route (app)                                         Size  First Load JS  Revalidate  Expire
┌ ○ /                                            12.1 kB         157 kB          1h      1y
├ ○ /_not-found                                    181 B         116 kB
├ ƒ /api/jobs/expire-bookings                      181 B         116 kB
├ ○ /artikel                                     1.75 kB         127 kB          1h      1y
├ ƒ /artikel/[slug]/opengraph-image-1wgs0y         181 B         116 kB
├ ƒ /dashboard                                     184 B         121 kB
├ ○ /manifest.webmanifest                          181 B         116 kB
├ ○ /paket-wisata                                  146 B         152 kB          1h      1y
├ ƒ /pesan/[packageSlug]                         8.74 kB         196 kB
└ ƒ /reservasi/cari                              8.28 kB        1.2 MB
+ First Load JS shared by all                     116 kB
`;

describe('readRows', () => {
  it('reads every page row with its first load in kB and skips handlers, images, the manifest and the shell', () => {
    expect(readRows(TABLE).map((row) => [row.route, row.kb])).toEqual([
      ['/', 157],
      ['/artikel', 127],
      ['/dashboard', 121],
      ['/paket-wisata', 152],
      ['/pesan/[packageSlug]', 196],
      ['/reservasi/cari', 1228.8],
    ]);
  });

  it('finds no row in a log without the table', () => {
    expect(readRows('Error: build failed\n')).toEqual([]);
  });
});

describe('budgetFor', () => {
  it.each([
    ['/', PUBLIC_BUDGET_KB],
    ['/paket-wisata/[slug]', PUBLIC_BUDGET_KB],
    ['/pesan/[packageSlug]', FORMS_BUDGET_KB],
    ['/reservasi/cari', FORMS_BUDGET_KB],
    ['/login', FORMS_BUDGET_KB],
    ['/mfa/verify', FORMS_BUDGET_KB],
    ['/loginx', PUBLIC_BUDGET_KB],
    ['/dashboard', DASHBOARD_BUDGET_KB],
    ['/dashboard/articles', DASHBOARD_BUDGET_KB],
  ])('%s gets %i kB', (route, budget) => {
    expect(budgetFor(route)).toBe(budget);
  });
});

describe('missingAnchors and overBudget', () => {
  it('is satisfied by a full table and names the one route over budget', () => {
    const rows = readRows(TABLE);
    expect(missingAnchors(rows)).toEqual([]);
    expect(overBudget(rows).map((row) => row.route)).toEqual(['/reservasi/cari']);
  });

  it('names the anchors a partial build leaves out', () => {
    const rows = readRows(
      TABLE.split('\n')
        .filter((line) => !line.includes('/dashboard'))
        .join('\n'),
    );
    expect(missingAnchors(rows)).toEqual(['/dashboard']);
  });
});

describe('checkBuildLog', () => {
  const without = (text) =>
    TABLE.split('\n')
      .filter((line) => !line.includes(text))
      .join('\n');

  it('passes a full table within budget and reports every row', () => {
    const verdict = checkBuildLog(without('/reservasi'), 'build.log');
    expect(verdict.exitCode).toBe(0);
    expect(verdict.report).toContain('ok   /pesan/[packageSlug]');
    expect(verdict.error).toBe('');
  });

  it('fails with 1 when a route passes its budget', () => {
    const verdict = checkBuildLog(TABLE, 'build.log');
    expect(verdict.exitCode).toBe(1);
    expect(verdict.report).toContain('OVER /reservasi/cari');
  });

  it('fails with 2 on a log that is not a full build, a failed one included', () => {
    expect(checkBuildLog(without('/paket-wisata'), 'build.log')).toMatchObject({
      exitCode: 2,
      error: 'route table in build.log lacks /paket-wisata: not a full build\n',
    });
    expect(checkBuildLog('Error: build failed\n', 'build.log').exitCode).toBe(2);
  });
});
