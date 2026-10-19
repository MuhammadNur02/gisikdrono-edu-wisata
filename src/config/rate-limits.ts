import type { RateLimitRule } from '@/types/rate-limit';

// docs/Security.md §8.3: every limit the server keeps in rate_limit_buckets, by bucket name. A limiter that cannot
// reach the database refuses (fail-closed), so sign-in, password reset, the scanner, exports and link minting never
// open up because Postgres is busy. Only booking creation (Task P3.4.02) may fail open, and only because Turnstile
// still stands in front of it (§4.3, BOOK-16).
export const RATE_LIMITS = {
  // Per staff member per hour. upload_sign counts api/uploads/sign and each booklet's single api/uploads/sign-pages;
  // upload_finalize leaves room for a whole booklet (its PDF and 100 pages) and photos; upload_forbidden caps how
  // many refused attempts are recorded one by one (security review of PR #14, L6, L8).
  upload_sign: { limit: 60, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  upload_finalize: { limit: 300, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  upload_forbidden: { limit: 10, windowSeconds: 3600, whenUnavailable: 'fail-closed' },
  // Task P2.4.08: the public "Unduh PDF" of a published booklet, per visitor IP.
  'booklet:download': { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-closed' },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;
