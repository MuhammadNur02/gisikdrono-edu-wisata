// The API routes the matcher of src/middleware.ts leaves out, because their callers are machines that never carry a
// staff session: webhooks, cron jobs and the uptime monitor's health check. The middleware is where every other
// response gets its CSP and Permissions-Policy (docs/Security.md §8.2), so these got neither (staging ZAP baseline
// and probe of 2026-10-29, docs/security-tests.md). They answer JSON, plain text or nothing and load no resource, so
// their policy allows no source at all; next.config.ts sends these headers on them.
// No `@/` imports: next.config.ts reads this file before the path aliases exist.

export const MACHINE_ROUTE_SOURCES = ['/api/webhooks/:path*', '/api/jobs/:path*', '/api/health'];

export const MACHINE_ROUTE_CSP = "default-src 'none'; frame-ancestors 'none'";

// The same closed policy src/lib/csp.ts permissionsPolicyFor gives every page but the scanner (src/lib/csp.test.ts
// holds the two together).
export const MACHINE_ROUTE_PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), display-capture=(), interest-cohort=()';

export const MACHINE_ROUTE_HEADERS = [
  { key: 'Content-Security-Policy', value: MACHINE_ROUTE_CSP },
  { key: 'Permissions-Policy', value: MACHINE_ROUTE_PERMISSIONS_POLICY },
];
