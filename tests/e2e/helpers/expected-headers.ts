// The headers of docs/Security.md §8.2 as plain data, with no test runner attached, so the Playwright specs
// (through ./security-headers.ts) and the staging probe (scripts/security-probe.ts, Task P5.2.02) check one list.

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
