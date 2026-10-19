// What a limiter does when it cannot reach rate_limit_buckets (docs/Security.md §4.3, BOOK-16).
export type RateLimitOutageMode = 'fail-closed' | 'fail-open';

export interface RateLimitRule {
  // Hits allowed per window under the normal profile; the strict profile allows half.
  limit: number;
  windowSeconds: number;
  whenUnavailable: RateLimitOutageMode;
}
