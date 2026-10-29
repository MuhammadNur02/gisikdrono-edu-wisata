import { tryToParsePath } from 'next/dist/lib/try-to-parse-path';
import { describe, expect, it } from 'vitest';

import { MACHINE_ROUTE_SOURCES } from '@/config/machine-routes';
import { config } from '@/middleware';

// The routes the middleware skips get their CSP and Permissions-Policy from next.config.ts (src/config/machine-routes.ts),
// so the two lists must name the same addresses (review of PR #111, L3). The matcher is compiled the way Next.js
// compiles it (path-to-regexp through tryToParsePath, which getMiddlewareMatchers calls).

const PATH_PARAM_SUFFIX = '/:path*';

function middlewareRuns(pathname: string): boolean {
  return config.matcher.some((source) => {
    const { regexStr } = tryToParsePath(source);
    if (regexStr === undefined) throw new Error(`the matcher ${source} does not parse`);
    return new RegExp(regexStr).test(pathname);
  });
}

// '/api/jobs/:path*' stands for /api/jobs itself and every path below it; '/api/health' for itself only.
function samplePathsOf(source: string): string[] {
  if (!source.endsWith(PATH_PARAM_SUFFIX)) return [source];
  const base = source.slice(0, -PATH_PARAM_SUFFIX.length);
  return [base, `${base}/`, `${base}/expire-bookings`, `${base}/midtrans/token`];
}

describe('the middleware matcher', () => {
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
