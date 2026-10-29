import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MACHINE_ROUTE_SOURCES } from '@/config/machine-routes';
import { config } from '@/middleware';

// The routes the middleware skips get their CSP and Permissions-Policy from next.config.ts (src/config/machine-routes.ts),
// so the two lists must name the same addresses (review of PR #111, L3). The matcher is compiled by Next.js' own
// getMiddlewareMatchers, the function the build runs on `config.matcher`, so the regular expressions tested here are
// the ones the deployment uses, with the data-route prefix and the transport suffixes Next.js adds around each source.
// Next.js exports it at runtime but its type declarations leave it out, so it is read through require and narrowed.

const PATH_PARAM_SUFFIX = '/:path*';
const SAMPLE_PATH_SEGMENT = 'any-path-segment';

type GetMiddlewareMatchers = (matcher: readonly string[], nextConfig: object) => unknown;

const staticInfoSchema = z.object({
  getMiddlewareMatchers: z.custom<GetMiddlewareMatchers>((value) => typeof value === 'function'),
});
const matchersSchema = z.array(z.object({ regexp: z.string() }));

function compiledMatchers(): RegExp[] {
  const staticInfo = staticInfoSchema.parse(
    createRequire(import.meta.url)('next/dist/build/analysis/get-page-static-info'),
  );
  const matchers = matchersSchema.parse(staticInfo.getMiddlewareMatchers(config.matcher, {}));
  return matchers.map((matcher) => new RegExp(matcher.regexp));
}

const MATCHERS = compiledMatchers();

function middlewareRuns(pathname: string): boolean {
  return MATCHERS.some((matcher) => matcher.test(pathname));
}

// '/api/jobs/:path*' stands for /api/jobs itself and every path below it, with or without a trailing slash;
// '/api/health' for itself, and itself with a trailing slash.
function samplePathsOf(source: string): string[] {
  if (!source.endsWith(PATH_PARAM_SUFFIX)) return [source, `${source}/`];
  const base = source.slice(0, -PATH_PARAM_SUFFIX.length);
  return [
    base,
    `${base}/`,
    `${base}/expire-bookings`,
    `${base}/midtrans/${SAMPLE_PATH_SEGMENT}`,
    `${base}/midtrans/${SAMPLE_PATH_SEGMENT}/`,
  ];
}

describe('the middleware matcher', () => {
  it('compiles to at least one expression', () => {
    expect(MATCHERS.length).toBeGreaterThan(0);
  });

  it('skips every route next.config.ts gives the machine-route headers', () => {
    for (const source of MACHINE_ROUTE_SOURCES) {
      for (const path of samplePathsOf(source)) expect(middlewareRuns(path), path).toBe(false);
    }
  });

  it('still runs on look-alikes of those routes', () => {
    for (const path of [
      '/apihealth',
      '/api/healthz',
      '/api/jobsx',
      '/api/webhooksx',
      '/api/health-check',
    ]) {
      expect(middlewareRuns(path), path).toBe(true);
    }
  });

  it('still runs on pages and on the staff API routes', () => {
    for (const path of ['/', '/dashboard', '/login', '/api/tickets/verify', '/api/export/visits']) {
      expect(middlewareRuns(path), path).toBe(true);
    }
  });

  it('still skips the static files', () => {
    for (const path of ['/_next/static/chunks/a.js', '/sw.js', '/icons/icon-192.png']) {
      expect(middlewareRuns(path), path).toBe(false);
    }
  });
});
