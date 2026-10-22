import 'server-only';

import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { RATE_LIMITS, type RateLimitName } from '@/config/rate-limits';
import { svcRateLimitHit, svcRateLimitRefund } from '@/db/rpc';
import type { Database } from '@/db/types';
import { createLogger } from '@/lib/logger';
import { pepperedHash } from '@/lib/pepper';
import type { RateLimitRule } from '@/types/rate-limit';

// The one wrapper around internal.rate_limit_hit (Task P1.1.13, docs/Security.md §4.3 and §8.3). It runs over the
// service-role client because no API role may call the limiter (P1.3.24); only the allow-listed services may create
// that client (CLAUDE.md §6.1), so they hand it in.

type DatabaseClient = SupabaseClient<Database>;

export interface RateLimitCheck {
  name: RateLimitName;
  // Who or what is counted: an IP, a normalised email, a staff id. It is hashed before it reaches the database.
  subject: string;
}

const SUBJECT_HASH_LENGTH = 24;
const PROFILE_SETTING = 'rate_limit_profile';
const STRICT_PROFILE = 'strict';
const STRICT_DIVISOR = 2;
const REFUSED_SUFFIX = 'refused';

// rate_limit_buckets keeps a key for an hour or so. A keyed hash keeps IPs, emails and ids out of it while one
// subject still lands in one bucket; OTP_PEPPER is the server's pepper for exactly this kind of hash.
export function rateLimitKey(name: RateLimitName, subject: string): string {
  const hash = pepperedHash('gsk-rate-limit-v1', subject).slice(0, SUBJECT_HASH_LENGTH);
  return `${name}:${hash}`;
}

// site_settings.rate_limit_profile `strict` halves every limit: the soft breaker of docs/Security.md §4.3.
async function isStrictProfile(adminClient: DatabaseClient): Promise<boolean> {
  const { data, error } = await adminClient
    .from('site_settings')
    .select('value')
    .eq('key', PROFILE_SETTING)
    .maybeSingle();
  if (error) throw error;
  return data?.value === STRICT_PROFILE;
}

// Typed as a rule, not as the literal entry, so the outage mode reads as either value.
function ruleFor(name: RateLimitName): RateLimitRule {
  return RATE_LIMITS[name];
}

function limitFor(name: RateLimitName, isStrict: boolean): number {
  const { limit } = ruleFor(name);
  return isStrict ? Math.max(1, Math.floor(limit / STRICT_DIVISOR)) : limit;
}

async function countHits(adminClient: DatabaseClient, checks: readonly RateLimitCheck[]) {
  const isStrict = await isStrictProfile(adminClient);
  const results = await Promise.all(
    checks.map((check) =>
      svcRateLimitHit(adminClient, {
        key: rateLimitKey(check.name, check.subject),
        limit: limitFor(check.name, isStrict),
        windowSeconds: ruleFor(check.name).windowSeconds,
      }),
    ),
  );
  return results.every(Boolean);
}

// True while every check is within its limit. Each check counts a hit, so a request refused by one limit still
// counts against the others. When the database cannot answer, a fail-closed limit passes the error on (the caller
// refuses as it does for any outage); only a request whose limits all fail open goes ahead.
export async function withinRateLimits(
  adminClient: DatabaseClient,
  checks: readonly RateLimitCheck[],
): Promise<boolean> {
  try {
    return await countHits(adminClient, checks);
  } catch (error) {
    const failsOpen = checks.every((check) => ruleFor(check.name).whenUnavailable === 'fail-open');
    if (!failsOpen) throw error;
    createLogger(randomUUID()).warn('internal_error', {
      source: 'rate_limit',
      limits: checks.map((check) => check.name),
      outcome: 'allowed_while_unavailable',
    });
    return true;
  }
}

// Gives back the hit each check counted, for a refusal the visitor could not have avoided (review of PR #27, L2). A
// refund that fails leaves the counts where they would be without refunds, so it is logged and the answer goes on.
export async function refundRateLimits(
  adminClient: DatabaseClient,
  checks: readonly RateLimitCheck[],
): Promise<void> {
  try {
    await Promise.all(
      checks.map((check) =>
        svcRateLimitRefund(adminClient, {
          key: rateLimitKey(check.name, check.subject),
          windowSeconds: ruleFor(check.name).windowSeconds,
        }),
      ),
    );
  } catch {
    createLogger(randomUUID()).warn('internal_error', {
      source: 'rate_limit',
      limits: checks.map((check) => check.name),
      outcome: 'refund_failed',
    });
  }
}

// True for the first refusal of a subject in its limit's window only, so a flood of refused requests leaves one
// security event rather than thousands (security review of PR #14, L8).
export function isFirstRefusal(
  adminClient: DatabaseClient,
  check: RateLimitCheck,
): Promise<boolean> {
  return svcRateLimitHit(adminClient, {
    key: `${rateLimitKey(check.name, check.subject)}:${REFUSED_SUFFIX}`,
    limit: 1,
    windowSeconds: ruleFor(check.name).windowSeconds,
  });
}
