import { expect, type APIResponse } from '@playwright/test';

// The headers of docs/Security.md §8.2 as the security specs check them (Task P5.4.01, P5.4.02, P5.3.02), shared by
// tests/e2e/security.spec.ts and tests/e2e/security-matrix.spec.ts. The expected values live in ./expected-headers.ts,
// which the staging probe (scripts/security-probe.ts) reads as well.

export { BASELINE_HEADERS, directive, expectedHeadersFor } from './expected-headers';

// The response itself is under test, so a redirect must come back as one.
export const NO_REDIRECTS = { maxRedirects: 0 };
export const SCANNER_PATH = '/dashboard/scanner';

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
