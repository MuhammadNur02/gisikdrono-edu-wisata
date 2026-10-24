import { expect, test, type APIResponse } from '@playwright/test';

import { cspViolationsOn } from './helpers/csp';
import {
  createSuperadmin,
  removeAccounts,
  resetAuthLimits,
  signInToDashboard,
} from './helpers/staff';

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

// Task P5.4.01, P5.4.02, P5.3.02 (HDR-01…HDR-03, APP-12): the headers of docs/Security.md §8.2 and the refusals of
// the security smoke, against the production build CI runs. CI sets no VERCEL_ENV, so the CSP is enforced here as
// on production (cspHeaderNameFor); only a preview deployment reports instead.

const SEEDED_WIZARD_PATH = `/pesan/${SEEDED_PACKAGE_SLUG}?step=jadwal`;
// Well-formed booking codes (Crockford base32) no seeded booking carries.
const UNKNOWN_BOOKING_CODE = 'GSK-7F3K9Q2Z';
const PUBLIC_PAGES = ['/', `/paket-wisata/${SEEDED_PACKAGE_SLUG}`];
const PRIVATE_PAGES = [SEEDED_WIZARD_PATH, '/login', '/reservasi/cari'];
const SCANNER_PATH = '/dashboard/scanner';
const JOB_PATHS = [
  '/api/jobs/expire-bookings',
  '/api/jobs/process-notifications',
  '/api/jobs/purge-storage',
];
const FOREIGN_ORIGIN = 'https://evil.example';

const BASELINE_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};
// docs/Security.md §8.2: booking and ticket addresses carry a code or token, so they send no Referer at all.
const NO_REFERRER_PREFIXES = ['/reservasi', '/v'];

function expectedHeadersFor(path: string): Record<string, string> {
  const pathname = new URL(path, 'http://localhost').pathname;
  const sendsNoReferrer = NO_REFERRER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return sendsNoReferrer
    ? { ...BASELINE_HEADERS, 'referrer-policy': 'no-referrer' }
    : BASELINE_HEADERS;
}

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((part) => part === name || part.startsWith(`${name} `));
}

function enforcedPolicyOf(response: APIResponse): string {
  const headers = response.headers();
  expect(headers['content-security-policy-report-only']).toBeUndefined();
  const policy = headers['content-security-policy'];
  expect(policy).toBeDefined();
  return policy ?? '';
}

function expectPrivateAndNoIndex(response: APIResponse) {
  const headers = response.headers();
  expect(headers['cache-control']).toMatch(/\bprivate\b/);
  expect(headers['cache-control']).toMatch(/\bno-store\b/);
  expect(headers['x-robots-tag']).toMatch(/\bnoindex\b/);
}

test.describe('security headers (docs/Security.md §8.2)', () => {
  for (const path of [...PUBLIC_PAGES, ...PRIVATE_PAGES]) {
    test(`${path} carries the baseline headers and an enforced CSP`, async ({ request }) => {
      const response = await request.get(path, NO_REDIRECTS);
      expect(response.status()).toBe(200);
      const headers = response.headers();
      for (const [name, value] of Object.entries(expectedHeadersFor(path))) {
        expect(headers[name], name).toBe(value);
      }
      const policy = enforcedPolicyOf(response);
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("object-src 'none'");
      expect(directive(policy, 'script-src')).not.toContain("'unsafe-eval'");
    });
  }

  test('a private page runs only scripts that carry its nonce', async ({ request }) => {
    const response = await request.get(SEEDED_WIZARD_PATH, NO_REDIRECTS);
    const scripts = directive(enforcedPolicyOf(response), 'script-src') ?? '';
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    const nonce = /'nonce-([^']+)'/.exec(scripts)?.[1];
    expect(nonce).toBeDefined();
    const html = await response.text();
    expect(html).toContain(`nonce="${nonce ?? ''}"`);
    // Every executable inline script carries it; JSON-LD is data, which CSP never runs.
    const inlineScripts =
      html.match(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/g) ?? [];
    for (const tag of inlineScripts) expect(tag).toContain(`nonce="${nonce ?? ''}"`);
  });

  test('two requests never share a nonce', async ({ request }) => {
    const nonces = await Promise.all(
      [1, 2].map(async () => {
        const policy = enforcedPolicyOf(await request.get('/login', NO_REDIRECTS));
        return /'nonce-([^']+)'/.exec(policy)?.[1];
      }),
    );
    expect(nonces[0]).toBeDefined();
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  for (const path of PRIVATE_PAGES) {
    test(`${path} is private, uncached and noindex`, async ({ request }) => {
      expectPrivateAndNoIndex(await request.get(path, NO_REDIRECTS));
    });
  }

  test('the API, a ticket landing and an unknown booking are private and noindex too', async ({
    request,
  }) => {
    expectPrivateAndNoIndex(await request.post(JOB_PATHS[0] ?? '', NO_REDIRECTS));
    for (const path of ['/v/GSK.k1.tidak-ada', `/reservasi/${UNKNOWN_BOOKING_CODE}`]) {
      const response = await request.get(path, NO_REDIRECTS);
      expectPrivateAndNoIndex(response);
      expect(response.headers()['referrer-policy']).toBe('no-referrer');
    }
  });

  test('the camera opens on the scanner only', async ({ request }) => {
    const home = (await request.get('/', NO_REDIRECTS)).headers()['permissions-policy'];
    const scanner = (await request.get(SCANNER_PATH, NO_REDIRECTS)).headers()['permissions-policy'];
    expect(home).toMatch(/^camera=\(\),/);
    expect(scanner).toMatch(/^camera=\(self\),/);
    expect(scanner).toContain('microphone=()');
  });
});

// Unknown addresses too: a public one, and private ones whose nonce policy a prerendered 404 could never satisfy
// (src/app/[...unknown]/page.tsx renders those per request).
const UNKNOWN_PAGES = [
  `/` + UNKNOWN_SLUG,
  `/reservasi/` + UNKNOWN_BOOKING_CODE,
  '/v/GSK.k1.tidak-ada',
];

test.describe('the enforced CSP blocks nothing the pages need', () => {
  for (const path of [...PUBLIC_PAGES, SEEDED_WIZARD_PATH, '/login', ...UNKNOWN_PAGES]) {
    test(`${path} loads without a CSP violation`, async ({ page }) => {
      expect(await cspViolationsOn(page, path)).toEqual([]);
    });
  }
});

test.describe('the security smoke refuses what it must (Task P5.3.02)', () => {
  test('/dashboard without a session goes to /login and keeps where it was headed', async ({
    request,
  }) => {
    const response = await request.get('/dashboard/packages', NO_REDIRECTS);
    expect(response.status()).toBe(307);
    const location = new URL(response.headers()['location'] ?? '', response.url());
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/dashboard/packages');
    // Even the redirect of a dashboard address is never cached or indexed (Task P5.4.02).
    expectPrivateAndNoIndex(response);
  });

  test('the Midtrans webhook under a wrong path token is a 404', async ({ request }) => {
    const response = await request.post('/api/webhooks/midtrans/bukan-token-yang-benar', {
      data: {},
      ...NO_REDIRECTS,
    });
    expect(response.status()).toBe(404);
  });

  for (const path of JOB_PATHS) {
    test(`${path} without the cron bearer is a 401`, async ({ request }) => {
      expect((await request.post(path, NO_REDIRECTS)).status()).toBe(401);
      const wrongBearer = { headers: { authorization: 'Bearer bukan-rahasia' }, ...NO_REDIRECTS };
      expect((await request.post(path, wrongBearer)).status()).toBe(401);
    });
  }

  test('a Server Action from another origin, or with no origin, is a 403', async ({ request }) => {
    const action = { 'next-action': '0'.repeat(42), 'content-type': 'text/plain;charset=UTF-8' };
    const foreign = await request.post('/login', {
      headers: { ...action, origin: FOREIGN_ORIGIN },
      data: '[]',
      ...NO_REDIRECTS,
    });
    expect(foreign.status()).toBe(403);
    const withoutOrigin = await request.post('/login', {
      headers: action,
      data: '[]',
      ...NO_REDIRECTS,
    });
    expect(withoutOrigin.status()).toBe(403);
  });

  test('the same POST from our own origin gets past the origin check', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post('/login', {
      headers: { 'next-action': '0'.repeat(42), origin: baseURL ?? '' },
      data: '[]',
      ...NO_REDIRECTS,
    });
    expect(response.status()).not.toBe(403);
  });

  test('an upload URL is refused without a staff session', async ({ request, baseURL }) => {
    const response = await request.post('/api/uploads/sign', {
      headers: { origin: baseURL ?? '' },
      data: { rwId: null, contentType: 'image/webp', size: 100, leadingBytes: 'UklGRg==' },
      ...NO_REDIRECTS,
    });
    expect(response.status()).toBe(401);
  });

  for (const path of [
    `/reservasi/${UNKNOWN_BOOKING_CODE}`,
    `/reservasi/${UNKNOWN_BOOKING_CODE}/bayar`,
  ]) {
    test(`${path} is a 404`, async ({ request }) => {
      expect((await request.get(path, NO_REDIRECTS)).status()).toBe(404);
    });
  }
});

test.describe('signed in as the superadmin (HDR-01, UPL-01)', () => {
  test.skip(({ isMobile }) => isMobile, 'one run is enough');
  test.describe.configure({ timeout: 90_000 });

  // An account of its own: staff-sign-in.spec.ts signs the seeded superadmin out everywhere, from another worker.
  let superadmin: { id: string; email: string } | undefined;

  test.beforeAll(async () => {
    await resetAuthLimits();
    superadmin = await createSuperadmin();
  });

  test.afterAll(async () => {
    await removeAccounts(superadmin ? [superadmin.id] : []);
  });

  // The scanner, with its own CSP (WebAssembly allowed there alone), and the session calendar as a heavy client page.
  // An unknown dashboard address is checked as well.
  test('dashboard pages and a dashboard 404 load without a CSP violation', async ({ page }) => {
    await signInToDashboard(page, superadmin?.email ?? '');
    for (const path of [
      '/dashboard',
      '/dashboard/sessions',
      SCANNER_PATH,
      '/dashboard/articles/new',
      '/dashboard/tidak-ada-e2e',
    ]) {
      expect(await cspViolationsOn(page, path), path).toEqual([]);
    }
  });

  test('api/uploads/sign answers VALIDATION for image/svg+xml', async ({ page, baseURL }) => {
    await signInToDashboard(page, superadmin?.email ?? '');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
    const response = await page.request.post('/api/uploads/sign', {
      headers: { origin: baseURL ?? '' },
      data: { rwId: null, contentType: 'image/svg+xml', size: 64, leadingBytes: svg },
      ...NO_REDIRECTS,
    });
    expect(response.status()).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});
