import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RATE_LIMITS, type RateLimitName } from '@/config/rate-limits';
import type { Database } from '@/db/types';
import { rateLimitKey, refundRateLimits, withinRateLimits } from '@/lib/rate-limit';

import { localStack, runSql, sqlText } from '../../scripts/local-stack';

// The limiter against Postgres (Task P5.1.02; docs/Security.md §4.3, BOOK-16): rate_limit_buckets counts a key once per
// hit even when the hits arrive together, the strict profile halves a limit, a refund gives a hit back, and when the
// database cannot answer every limit of src/config/rate-limits.ts fails closed except the three booking ones, which
// fail open while Turnstile stays mandatory. The order in which createBookingAction asks them is the unit test of src/server/actions/booking.test.ts.

const PARALLEL_HITS = 30;
// docs/Security.md §4.3: the only limits that let a request through while the database cannot answer.
const FAIL_OPEN = ['booking:email', 'booking:ip+ua', 'booking:phone'];

const bucketRowsSchema = z.array(z.object({ key: z.string(), count: z.coerce.number() }));

function serviceClient() {
  return createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// The outage the matrix is about, at once (review of PR #84, L-7): every request fails as an unreachable host does,
// and the client's own retries of a read are off, so the answer comes without their seconds of backoff.
function outage() {
  const unreachable: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
  return createClient<Database>(localStack().apiUrl, localStack().serviceRoleKey, {
    auth: { persistSession: false },
    db: { retry: false },
    global: { fetch: unreachable },
  });
}

const limitNames = Object.keys(RATE_LIMITS) as RateLimitName[];

// A subject of this test alone, so no bucket of another run or suite is counted.
const subjectOf = (label: string) => `${label}-${randomUUID()}`;

async function setProfile(profile: 'normal' | 'strict'): Promise<void> {
  await runSql(`update public.site_settings set value = ${sqlText(JSON.stringify(profile))}::jsonb
    where key = 'rate_limit_profile'`);
}

afterAll(async () => {
  await setProfile('normal');
});

describe('the limiter on rate_limit_buckets', () => {
  it('lets exactly the limit through when the hits arrive at once, and keeps no subject in the key', async () => {
    const subject = subjectOf('203.0.113.9');
    const check = { name: 'booking_create:ip' as const, subject };
    const answers = await Promise.all(
      Array.from({ length: PARALLEL_HITS }, () => withinRateLimits(serviceClient(), [check])),
    );

    expect(answers.filter(Boolean)).toHaveLength(RATE_LIMITS['booking_create:ip'].limit);
    const rows = bucketRowsSchema.parse(
      await runSql(`select key, count from public.rate_limit_buckets
        where key = ${sqlText(rateLimitKey(check.name, subject))}`),
    );
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(PARALLEL_HITS);
    for (const row of rows) expect(row.key).not.toContain(subject);
  });

  it('halves every limit under the strict profile', async () => {
    await setProfile('strict');
    const check = { name: 'quotation:create' as const, subject: subjectOf('strict') };
    const strictLimit = Math.max(1, Math.floor(RATE_LIMITS['quotation:create'].limit / 2));
    const answers: boolean[] = [];
    for (let hit = 0; hit <= strictLimit; hit += 1) {
      answers.push(await withinRateLimits(serviceClient(), [check]));
    }
    await setProfile('normal');

    expect(answers).toEqual([...Array<boolean>(strictLimit).fill(true), false]);
  });

  it('gives a refunded hit back, so the next request fits again', async () => {
    const check = { name: 'review:submit' as const, subject: subjectOf('refund') };
    const limit = RATE_LIMITS['review:submit'].limit;
    for (let hit = 0; hit < limit; hit += 1) {
      await expect(withinRateLimits(serviceClient(), [check])).resolves.toBe(true);
    }
    await expect(withinRateLimits(serviceClient(), [check])).resolves.toBe(false);

    await refundRateLimits(serviceClient(), [check]);
    await refundRateLimits(serviceClient(), [check]);
    await expect(withinRateLimits(serviceClient(), [check])).resolves.toBe(true);
  });
});

// Review of PR #84, M-2: the matrix is read from src/config/rate-limits.ts, so a limit added there is tested here.
describe('the fail-closed matrix while the database cannot answer', () => {
  it('fails open for the three booking limits alone', () => {
    const failOpen = limitNames.filter((name) => RATE_LIMITS[name].whenUnavailable === 'fail-open');
    expect([...failOpen].sort()).toEqual(FAIL_OPEN);
    for (const name of limitNames) {
      expect(['fail-open', 'fail-closed']).toContain(RATE_LIMITS[name].whenUnavailable);
    }
  });

  it('refuses every other limit by passing the outage on', async () => {
    const failClosed = limitNames.filter((name) => !FAIL_OPEN.includes(name));
    const outcomes = await Promise.allSettled(
      failClosed.map((name) => withinRateLimits(outage(), [{ name, subject: 'outage' }])),
    );
    const allowed = failClosed.filter((_, index) => outcomes[index]?.status !== 'rejected');
    expect(allowed).toEqual([]);
  });

  it('lets a booking through on its fail-open limits alone', async () => {
    const checks = FAIL_OPEN.map((name) => ({ name: name as RateLimitName, subject: 'outage' }));
    await expect(withinRateLimits(outage(), checks)).resolves.toBe(true);
  });

  it('refuses a request that mixes a fail-open limit with a fail-closed one', async () => {
    const checks = [
      { name: 'booking:phone' as const, subject: 'outage' },
      { name: 'booking_create:ip' as const, subject: 'outage' },
    ];
    await expect(withinRateLimits(outage(), checks)).rejects.toBeDefined();
  });
});
