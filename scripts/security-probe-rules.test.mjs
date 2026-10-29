import { describe, expect, it } from 'vitest';

import {
  cspModeOf,
  headerProblems,
  isNoIndex,
  loginRedirectProblems,
  piiProblems,
  robotsProblems,
  scriptChunksOf,
  sitemapProblems,
  sourceMapProblems,
} from './security-probe-rules.ts';
import { MACHINE_ROUTE_HEADERS } from '../src/config/machine-routes.ts';
import { BASELINE_HEADERS } from '../tests/e2e/helpers/expected-headers.ts';

// Task P5.2.02: the staging probe's rules refuse what docs/Security.md §8.2 forbids and pass what it asks for.

const POLICY = "default-src 'self'; object-src 'none'; frame-ancestors 'none'";
const GOOD_BASE = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=()',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy-report-only': POLICY,
};
const PRIVATE_EXTRA = { 'cache-control': 'private, no-store' };
const PREVIEW = false;
const PRODUCTION = true;

describe('headerProblems', () => {
  it('passes a public page with the baseline and a report-only CSP', () => {
    expect(headerProblems('/', new Headers(GOOD_BASE), PREVIEW)).toEqual([]);
  });

  it('asks a private path for private, no-store', () => {
    expect(headerProblems('/api/health', new Headers(GOOD_BASE), PREVIEW)).toEqual([
      'cache-control is "", not private, no-store',
    ]);
    expect(
      headerProblems('/api/health', new Headers({ ...GOOD_BASE, ...PRIVATE_EXTRA }), PREVIEW),
    ).toEqual([]);
  });

  it('asks a booking page for no-referrer', () => {
    const headers = new Headers({ ...GOOD_BASE, ...PRIVATE_EXTRA });
    expect(headerProblems('/reservasi/x', headers, PREVIEW)).toEqual([
      'referrer-policy is "strict-origin-when-cross-origin", expected "no-referrer"',
    ]);
  });

  it('names a missing header, an open camera, a framable policy and a missing noindex', () => {
    const headers = new Headers({
      ...GOOD_BASE,
      'permissions-policy': 'camera=(self)',
      'content-security-policy-report-only': "object-src 'none'",
    });
    headers.delete('x-frame-options');
    headers.delete('x-robots-tag');
    expect(headerProblems('/', headers, PREVIEW)).toEqual([
      'x-frame-options is "(missing)", expected "DENY"',
      'permissions-policy does not start with camera=()',
      'x-robots-tag carries no noindex',
      "content-security-policy-report-only: frame-ancestors is not 'none'",
    ]);
  });

  it('lets a production public page go without noindex, never a private one', () => {
    const headers = new Headers({ ...GOOD_BASE, ...PRIVATE_EXTRA });
    headers.delete('x-robots-tag');
    expect(headerProblems('/', headers, PRODUCTION)).toEqual([]);
    expect(headerProblems('/login', headers, PRODUCTION)).toEqual([
      'x-robots-tag carries no noindex',
    ]);
  });

  it('names a page with no CSP at all', () => {
    const headers = new Headers(GOOD_BASE);
    headers.delete('content-security-policy-report-only');
    expect(headerProblems('/', headers, PREVIEW)).toEqual([
      'no Content-Security-Policy of either kind',
    ]);
    expect(cspModeOf(headers)).toBe('none');
    expect(cspModeOf(new Headers({ 'content-security-policy': POLICY }))).toBe('enforced');
    expect(cspModeOf(new Headers(GOOD_BASE))).toBe('report-only');
  });
});

// Review of PR #111, M1: what next.config.ts sends on the routes the middleware skips passes the probe's own rules,
// on a preview (noindex on every response) and on production alike.
describe('the machine-route headers of next.config.ts', () => {
  const headersOf = (extra) =>
    new Headers({
      ...BASELINE_HEADERS,
      ...PRIVATE_EXTRA,
      ...extra,
      ...Object.fromEntries(MACHINE_ROUTE_HEADERS.map(({ key, value }) => [key, value])),
    });

  it('pass headerProblems for the health check, a job and a webhook', () => {
    const headers = headersOf({ 'x-robots-tag': 'noindex, nofollow' });
    for (const path of ['/api/health', '/api/jobs/expire-bookings', '/api/webhooks/whatsapp']) {
      expect(headerProblems(path, headers, PREVIEW), path).toEqual([]);
      expect(headerProblems(path, headers, PRODUCTION), path).toEqual([]);
    }
    expect(cspModeOf(headers)).toBe('enforced');
  });
});

describe('isNoIndex', () => {
  it('reads the X-Robots-Tag of a preview, and nothing else', () => {
    expect(isNoIndex(new Headers({ 'x-robots-tag': 'noindex, nofollow' }))).toBe(true);
    expect(isNoIndex(new Headers({ 'x-robots-tag': 'all' }))).toBe(false);
    expect(isNoIndex(new Headers())).toBe(false);
  });
});

describe('loginRedirectProblems', () => {
  it('passes a 307 to /login that keeps next', () => {
    expect(
      loginRedirectProblems('/dashboard/finance', 307, '/login?next=%2Fdashboard%2Ffinance'),
    ).toEqual([]);
  });

  it('refuses a 200, another target and a lost next', () => {
    expect(loginRedirectProblems('/dashboard', 200, null)).toEqual(['status 200, expected 307']);
    expect(loginRedirectProblems('/dashboard', 307, '/')).toEqual([
      'redirects to /, expected /login',
    ]);
    expect(loginRedirectProblems('/dashboard/finance', 307, '/login')).toEqual([
      'the login redirect loses ?next=',
    ]);
  });
});

describe('loginRedirectProblems for the dashboard itself', () => {
  it('passes /dashboard without next, where signing in leads anyway', () => {
    expect(loginRedirectProblems('/dashboard', 307, '/login')).toEqual([]);
    expect(loginRedirectProblems('/dashboard', 307, '/login?next=%2Fdashboard')).toEqual([
      'the login redirect loses ?next=',
    ]);
  });
});

describe('sourceMapProblems', () => {
  it('passes a refused map and a chunk that names none', () => {
    expect(sourceMapProblems('/_next/static/a.js', 403, 'console.log(1)')).toEqual([]);
    expect(sourceMapProblems('/_next/static/a.js', 404, '')).toEqual([]);
  });

  it('names a served map and a chunk that points at one', () => {
    expect(sourceMapProblems('/_next/static/a.js', 200, '//# sourceMappingURL=a.js.map')).toEqual([
      '/_next/static/a.js.map is served (status 200)',
      '/_next/static/a.js names a source map',
    ]);
  });
});

describe('piiProblems', () => {
  it('finds a phone, an email and a booking code, and passes plain copy', () => {
    expect(piiProblems('Hubungi +6281234567890, a@b.co, GSK-7F3K9Q2M')).toHaveLength(3);
    expect(piiProblems('<p>Tiket tidak valid</p>')).toEqual([]);
  });
});

describe('robotsProblems', () => {
  it('passes a deployment that disallows everything', () => {
    expect(robotsProblems('User-Agent: *\nDisallow: /\n')).toEqual([]);
  });

  it('passes production that lists every private path, and names one it forgot', () => {
    const listed = ['/dashboard', '/api', '/pesan', '/reservasi', '/login', '/v'];
    const text = `User-Agent: *\nAllow: /\n${listed.map((path) => `Disallow: ${path}`).join('\n')}`;
    expect(robotsProblems(text)).toEqual([]);
    expect(robotsProblems(text.replace('Disallow: /v', ''))).toEqual([
      'robots.txt does not disallow /v',
    ]);
  });
});

describe('sitemapProblems', () => {
  it('names a private route and passes public ones', () => {
    const xml =
      '<urlset><url><loc>https://x.test/paket-wisata</loc></url><url><loc>https://x.test/v/abc</loc></url></urlset>';
    expect(sitemapProblems(xml)).toEqual(['the sitemap lists the private path /v/abc']);
    expect(sitemapProblems('<urlset><url><loc>https://x.test/vendor</loc></url></urlset>')).toEqual(
      [],
    );
  });
});

describe('scriptChunksOf', () => {
  it('lists each same-site chunk once', () => {
    const html =
      '<script src="/_next/static/chunks/a.js" async></script><link href="/_next/static/chunks/a.js"><script src="https://cdn.test/x.js"></script>';
    expect(scriptChunksOf(html)).toEqual(['/_next/static/chunks/a.js']);
  });
});
