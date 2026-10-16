import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';

const BEARER_PREFIX = 'Bearer ';

// pg_cron calls every api/jobs route with `Authorization: Bearer <CRON_SECRET>` (CLAUDE.md §5.4).
// Both sides are hashed first, so timingSafeEqual always compares equal lengths and the time taken
// says nothing about the secret, not even its length.
export function hasValidCronSecret(authorization: string | null): boolean {
  if (!authorization?.startsWith(BEARER_PREFIX)) return false;
  const presented = sha256(authorization.slice(BEARER_PREFIX.length));
  return timingSafeEqual(presented, sha256(serverEnv.CRON_SECRET));
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
