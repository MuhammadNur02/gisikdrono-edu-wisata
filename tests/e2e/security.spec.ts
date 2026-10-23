import { expect, test } from '@playwright/test';

// Task P5.6.05: a public page that looks a row up answers with its real status code. The row-reading pages sit in
// src/app/(public)/(rows), under no loading boundary, so notFound() and redirect() run before anything streams
// and no ISR entry is left for an unknown address. The last two checks held already (Task P2.10.02): the
// middleware's part, an unknown top-level address and the internal RW folder. Plain requests against the
// production build CI runs; no browser is needed, so the suite is quick on both projects.

// A slug no seeded row carries, in every table the pages read.
const UNKNOWN_SLUG = 'tidak-ada-e2e';
// An address shaped like an RW page (rwRouteRewriteFor) for an RW that does not exist.
const UNKNOWN_RW_PATH = '/rw-99-tidak-ada';
// RW 05 is online but has no performance schedule (rw_units.schedule_enabled), so its /jadwal is not a page.
const ONLINE_RW_SLUG = 'rw-05-ecowastreme';
// RW 13 is online with schedule_enabled (20261022080000), so its /jadwal is a page.
const SCHEDULED_RW_SLUG = 'rw-13-kampung-budaya-seni';
// The arts programme's old RW 08 address answers 308 to RW 13 (src/config/redirects.ts), before the middleware.
const MOVED_RW_PATH = '/rw-08-kampung-seni-budaya';
// A package pnpm db:seed publishes (scripts/seed-dev.sql), the one the booking wizard spec books.
const SEEDED_PACKAGE_SLUG = 'paket-eduwisata-ecowastreme';
// A well-formed RW filter (src/config/gallery.ts) for an RW the gallery does not know: only the page can refuse it.
const OFFLINE_RW_FILTER = 'rw99';
// The response itself is under test, so a redirect must come back as one.
const NO_REDIRECTS = { maxRedirects: 0 };

const NOT_FOUND_PATHS = [
  `/paket-wisata/${UNKNOWN_SLUG}`,
  `/produk/${UNKNOWN_SLUG}`,
  `/artikel/${UNKNOWN_SLUG}`,
  `/e-booklet/${UNKNOWN_SLUG}`,
  UNKNOWN_RW_PATH,
  `${UNKNOWN_RW_PATH}/jadwal`,
  `/${ONLINE_RW_SLUG}/jadwal`,
];

test.describe('a public page that looks a row up answers its real status code', () => {
  for (const path of NOT_FOUND_PATHS) {
    test(`${path} is a 404`, async ({ request }) => {
      const response = await request.get(path, NO_REDIRECTS);
      expect(response.status()).toBe(404);
    });
  }

  test('the gallery filter of an RW that is not online is a 307 to the whole gallery', async ({
    request,
  }) => {
    const response = await request.get(`/galeri?filter=${OFFLINE_RW_FILTER}`, NO_REDIRECTS);
    expect(response.status()).toBe(307);
    const location = response.headers()['location'];
    expect(location).toBeDefined();
    expect(new URL(location ?? '', response.url()).pathname).toBe('/galeri');
  });
});

test.describe('the checks that held already (Task P2.10.02)', () => {
  test('an unknown top-level address is a 404', async ({ request }) => {
    const response = await request.get(`/${UNKNOWN_SLUG}`, NO_REDIRECTS);
    expect(response.status()).toBe(404);
  });

  test('the internal RW folder is not served directly', async ({ request }) => {
    const response = await request.get(`/rw-page/${ONLINE_RW_SLUG}`, NO_REDIRECTS);
    expect(response.status()).toBe(404);
  });

  test('an RW page that exists still answers 200', async ({ request }) => {
    const response = await request.get(`/${ONLINE_RW_SLUG}`, NO_REDIRECTS);
    expect(response.status()).toBe(200);
  });
});

// The pages that exist keep answering 200, and the moved RW address its 308, so the 404s above are not a route
// that stopped matching (review of PR #30).
test.describe('the pages beside them still answer as before', () => {
  test('a seeded package page is a 200', async ({ request }) => {
    const response = await request.get(`/paket-wisata/${SEEDED_PACKAGE_SLUG}`, NO_REDIRECTS);
    expect(response.status()).toBe(200);
  });

  test('the /jadwal of an RW with a schedule is a 200', async ({ request }) => {
    const response = await request.get(`/${SCHEDULED_RW_SLUG}/jadwal`, NO_REDIRECTS);
    expect(response.status()).toBe(200);
  });

  test('the old RW 08 arts address is a 308 to RW 13', async ({ request }) => {
    const response = await request.get(MOVED_RW_PATH, NO_REDIRECTS);
    expect(response.status()).toBe(308);
    const location = response.headers()['location'];
    expect(new URL(location ?? '', response.url()).pathname).toBe(`/${SCHEDULED_RW_SLUG}`);
  });
});
