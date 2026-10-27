import { expect, type APIResponse } from '@playwright/test';

// The headers of docs/Security.md §8.2 as the security specs check them (Task P5.4.01, P5.4.02, P5.3.02), shared by
// tests/e2e/security.spec.ts and tests/e2e/security-matrix.spec.ts.

// The response itself is under test, so a redirect must come back as one.
export const NO_REDIRECTS = { maxRedirects: 0 };
export const SCANNER_PATH = '/dashboard/scanner';

export const BASELINE_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};
// docs/Security.md §8.2: booking and ticket addresses carry a code or token, so they send no Referer at all.
const NO_REFERRER_PREFIXES = ['/reservasi', '/v'];

export function expectedHeadersFor(path: string): Record<string, string> {
  const pathname = new URL(path, 'http://localhost').pathname;
  const sendsNoReferrer = NO_REFERRER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return sendsNoReferrer
    ? { ...BASELINE_HEADERS, 'referrer-policy': 'no-referrer' }
    : BASELINE_HEADERS;
}

export function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((part) => part === name || part.startsWith(`${name} `));
}

export function enforcedPolicyOf(response: APIResponse): string {
  const headers = response.headers();
  expect(headers['content-security-policy-report-only']).toBeUndefined();
  const policy = headers['content-security-policy'];
  expect(policy).toBeDefined();
  return policy ?? '';
}

export function expectPrivateAndNoIndex(response: APIResponse) {
  const headers = response.headers();
  expect(headers['cache-control']).toMatch(/\bprivate\b/);
  expect(headers['cache-control']).toMatch(/\bno-store\b/);
  expect(headers['x-robots-tag']).toMatch(/\bnoindex\b/);
}
