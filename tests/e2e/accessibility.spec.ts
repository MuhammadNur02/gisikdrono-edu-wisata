import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Task P5.6.04: automated WCAG 2.1 AA checks (docs/StyleGuide.md §9.1, A1) on the public pages, the start of the
// booking wizard and the staff sign-in, against the production build CI serves from the pnpm db:seed stack. Both
// projects run, since the 360 px layout has its own navigation drawer and stacking. A serious or critical
// violation fails the test; minor and moderate ones are kept in the report for the manual pass.

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type AxeViolation = AxeResults['violations'][number];

// The success criteria of WCAG 2.1 levels A and AA, the level docs/StyleGuide.md commits to.
const WCAG_21_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS: readonly string[] = ['serious', 'critical'];
// Enough selectors to find the element in the trace without flooding the log.
const TARGETS_SHOWN = 5;

// Cloudflare's Turnstile iframe mounts asynchronously and is not ours to fix, so scanning it makes a run flaky.
// Its container (TurnstileField, a labelled group) stays in the scan. Every audited page excludes it, so a form
// that gains the widget later needs no change here.
const TURNSTILE_IFRAME = 'iframe[src*="challenges.cloudflare.com"]';

// The package pnpm db:seed publishes (scripts/seed-demo-content.sql), the one the booking wizard spec books.
const SEEDED_PACKAGE_SLUG = 'paket-eduwisata-ecowastreme';

const AUDITED_PAGES = [
  { name: 'beranda', path: '/' },
  { name: 'halaman RW', path: '/rw-05-ecowastreme' },
  { name: 'detail paket', path: `/paket-wisata/${SEEDED_PACKAGE_SLUG}` },
  { name: 'daftar produk', path: '/produk' },
  { name: 'galeri', path: '/galeri' },
  { name: 'peta & kontak', path: '/peta-kontak' },
  { name: 'privasi', path: '/privasi' },
  { name: 'awal wizard pemesanan', path: `/pesan/${SEEDED_PACKAGE_SLUG}` },
  { name: 'masuk staf', path: '/login' },
] as const;

function describeViolation(violation: AxeViolation): string {
  const targets = violation.nodes
    .slice(0, TARGETS_SHOWN)
    .map((node) => `    ${node.target.join(' ')}`)
    .join('\n');
  return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${targets}`;
}

async function attachReport(testInfo: TestInfo, results: AxeResults) {
  await testInfo.attach('axe-results.json', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
}

// /peta-kontak loads its RW area map in a lazy chunk; the audit waits for Leaflet's container so the map, its
// labels and markers are part of what axe reads.
const MAP_PAGE = '/peta-kontak';
const MAP_CONTAINER = '#wilayah .leaflet-container';

async function auditPage(
  page: Page,
  testInfo: TestInfo,
  path: string,
  colorScheme: 'light' | 'dark',
) {
  // The home reveals are scroll-driven; reduced motion shows every block in its final colours, so the
  // contrast check reads what a visitor reads once the animation has ended.
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator('main')).toBeVisible();
  if (path === MAP_PAGE) await expect(page.locator(MAP_CONTAINER)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_21_AA_TAGS)
    .exclude(TURNSTILE_IFRAME)
    .analyze();
  await attachReport(testInfo, results);

  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.includes(violation.impact ?? ''),
  );
  expect(blocking, blocking.map(describeViolation).join('\n')).toEqual([]);
}

for (const { name, path } of AUDITED_PAGES) {
  test(`${name} (${path}) has no serious or critical axe violation`, async ({ page }, testInfo) => {
    await auditPage(page, testInfo, path, 'light');
  });
}

// The map draws light-theme tokens over the always-light tiles in either scheme (src/styles/globals.css), so a
// visitor whose system asks for dark gets the same contrast.
test('peta & kontak (/peta-kontak) in a dark colour scheme has no serious or critical axe violation', async ({
  page,
}, testInfo) => {
  await auditPage(page, testInfo, MAP_PAGE, 'dark');
});
