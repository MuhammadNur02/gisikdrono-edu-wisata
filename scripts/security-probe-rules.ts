import { directive, expectedHeadersFor } from '../tests/e2e/helpers/expected-headers';

// The pure half of the staging probe (scripts/security-probe.ts, Task P5.2.02): what a response must look like,
// with no network and no host, so scripts/security-probe-rules.test.mjs can prove each rule refuses what it should.
// Every rule answers a list of problems; an empty list is a pass.

export const HTTP = {
  ok: 200,
  multipleChoices: 300,
  temporaryRedirect: 307,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  serviceUnavailable: 503,
} as const;

// CLAUDE.md §5.6 and src/app/robots.ts: crawlers stay out of these, and the sitemap never names them.
export const CRAWLER_PRIVATE_PATHS = ['/dashboard', '/api', '/pesan', '/reservasi', '/login', '/v'];
// docs/Security.md §8.2: private routes (src/config/routes.ts) and the API are never cached or indexed.
const NO_STORE_PREFIXES = [
  ...CRAWLER_PRIVATE_PATHS,
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/onboarding',
  '/auth',
];
const DASHBOARD_PATH = '/dashboard';
const SOURCE_MAP_COMMENT = /\/\/# sourceMappingURL=/;
const CSP_HEADERS = ['content-security-policy', 'content-security-policy-report-only'];
const CAMERA_OFF = /^camera=\(\),/;
// A phone in E.164 for Indonesia, an email address, or a booking code: none may show to a visitor without a link.
const PII_PATTERNS: Record<string, RegExp> = {
  phone: /\+62\d{8,}/,
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  bookingCode: /GSK-[0-9A-HJKMNP-TV-Z]{8}/,
};

export function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNoStorePath(path: string): boolean {
  const pathname = new URL(path, 'http://localhost').pathname;
  return NO_STORE_PREFIXES.some((prefix) => isUnder(pathname, prefix));
}

function cspProblems(headers: Headers): string[] {
  const name = CSP_HEADERS.find((header) => headers.has(header));
  if (name === undefined) return ['no Content-Security-Policy of either kind'];
  const policy = headers.get(name) ?? '';
  const problems: string[] = [];
  if (directive(policy, 'frame-ancestors') !== "frame-ancestors 'none'") {
    problems.push(`${name}: frame-ancestors is not 'none'`);
  }
  if (directive(policy, 'object-src') !== "object-src 'none'") {
    problems.push(`${name}: object-src is not 'none'`);
  }
  return problems;
}

function privacyProblems(headers: Headers): string[] {
  const cacheControl = headers.get('cache-control') ?? '';
  const problems: string[] = [];
  if (!/\bprivate\b/.test(cacheControl) || !/\bno-store\b/.test(cacheControl)) {
    problems.push(`cache-control is "${cacheControl}", not private, no-store`);
  }
  return problems;
}

// docs/Security.md §8.2 for one response. `isProduction` false: every response must carry noindex, as next.config.ts
// adds it on a non-production deployment.
export function headerProblems(path: string, headers: Headers, isProduction = false): string[] {
  const problems = Object.entries(expectedHeadersFor(path))
    .filter(([name, value]) => headers.get(name) !== value)
    .map(
      ([name, value]) => `${name} is "${headers.get(name) ?? '(missing)'}", expected "${value}"`,
    );
  if (!CAMERA_OFF.test(headers.get('permissions-policy') ?? '')) {
    problems.push('permissions-policy does not start with camera=()');
  }
  const needsNoIndex = !isProduction || isNoStorePath(path);
  if (needsNoIndex && !/\bnoindex\b/.test(headers.get('x-robots-tag') ?? '')) {
    problems.push('x-robots-tag carries no noindex');
  }
  if (isNoStorePath(path)) problems.push(...privacyProblems(headers));
  return [...problems, ...cspProblems(headers)];
}

// The CSP is report-only on a preview deployment by design (src/lib/csp.ts cspHeaderNameFor); the probe says which.
export function cspModeOf(headers: Headers): 'enforced' | 'report-only' | 'none' {
  if (headers.has('content-security-policy')) return 'enforced';
  if (headers.has('content-security-policy-report-only')) return 'report-only';
  return 'none';
}

export function piiProblems(body: string): string[] {
  return Object.entries(PII_PATTERNS)
    .filter(([, pattern]) => pattern.test(body))
    .map(([kind]) => `the body shows something shaped like a ${kind}`);
}

export function loginRedirectProblems(
  path: string,
  status: number,
  location: string | null,
): string[] {
  if (status !== HTTP.temporaryRedirect) return [`status ${String(status)}, expected 307`];
  const target = new URL(location ?? '', 'http://localhost');
  if (target.pathname !== '/login') return [`redirects to ${target.pathname}, expected /login`];
  // src/lib/utils/staff-paths.ts pathWithNext: /dashboard is where signing in leads anyway, so it carries no next.
  const expectedNext = path === DASHBOARD_PATH ? null : path;
  if (target.searchParams.get('next') !== expectedNext) return ['the login redirect loses ?next='];
  return [];
}

// A source map answered with anything but a success is not served (Vercel answers 403 for a .map file).
export function sourceMapProblems(chunk: string, status: number, script: string): string[] {
  const problems: string[] = [];
  if (status >= HTTP.ok && status < HTTP.multipleChoices) {
    problems.push(`${chunk}.map is served (status ${String(status)})`);
  }
  if (SOURCE_MAP_COMMENT.test(script)) problems.push(`${chunk} names a source map`);
  return problems;
}

// robots.txt for the group of every crawler: either everything is disallowed (a preview deployment) or each
// private path is.
export function robotsProblems(text: string): string[] {
  const disallowed = text
    .split(/\r?\n/)
    .map((line) => /^\s*disallow:\s*(\S*)/i.exec(line)?.[1])
    .filter((value): value is string => value !== undefined && value !== '');
  if (disallowed.includes('/')) return [];
  return CRAWLER_PRIVATE_PATHS.filter((path) => !disallowed.includes(path)).map(
    (path) => `robots.txt does not disallow ${path}`,
  );
}

export function sitemapProblems(xml: string): string[] {
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');
  return locations
    .map((location) => new URL(location, 'http://localhost').pathname)
    .filter((pathname) => CRAWLER_PRIVATE_PATHS.some((prefix) => isUnder(pathname, prefix)))
    .map((pathname) => `the sitemap lists the private path ${pathname}`);
}

// The first-party script chunks a page loads, as same-site paths.
export function scriptChunksOf(html: string): string[] {
  const paths = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+\.js)/g)].map(
    (match) => match[1] ?? '',
  );
  return [...new Set(paths)];
}
