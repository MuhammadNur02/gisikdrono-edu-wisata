import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import type { RateLimitRule } from '@/types/rate-limit';

import { isFirstRefusal, rateLimitKey, withinRateLimits } from './rate-limit';

// Booking creation (Task P3.4.02) brings the first fail-open limit; until then booklet:download plays that part
// here so the fail-open branch is proven before anything depends on it.
vi.mock('@/config/rate-limits', async (importOriginal) => {
  const actual = await importOriginal<{ RATE_LIMITS: Record<string, RateLimitRule> }>();
  const failOpen: RateLimitRule = { limit: 30, windowSeconds: 60, whenUnavailable: 'fail-open' };
  return { RATE_LIMITS: { ...actual.RATE_LIMITS, 'booklet:download': failOpen } };
});
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

type Hit = { p_key: string; p_limit: number; p_window_seconds: number };

const OFFICER_ID = '00000000-0000-4000-8000-000000000005';

// A real typed client whose fetch plays PostgREST: site_settings answers the profile, and svc_rate_limit_hit
// counts hits per key the way internal.rate_limit_hit does within one window.
function limiterClient(options: { profile?: string; isDown?: boolean } = {}) {
  const hits: Hit[] = [];
  const counts = new Map<string, number>();
  const reply = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const fakeFetch: typeof fetch = (input, init) => {
    if (options.isDown) return reply(500, { message: 'database unavailable' });
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === '/rest/v1/site_settings') {
      return reply(200, options.profile === undefined ? [] : [{ value: options.profile }]);
    }
    const hit = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Hit;
    hits.push(hit);
    const count = (counts.get(hit.p_key) ?? 0) + 1;
    counts.set(hit.p_key, count);
    return reply(200, count <= hit.p_limit);
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, hits };
}

describe('rateLimitKey', () => {
  it('names the bucket and hashes the subject, so no IP, email or id is stored', () => {
    const key = rateLimitKey('booklet:download', '203.0.113.7');

    expect(key).toMatch(/^booklet:download:[0-9a-f]{24}$/);
    expect(key).not.toContain('203.0.113.7');
  });

  it('gives one subject one bucket per limit, and different subjects different buckets', () => {
    expect(rateLimitKey('upload_sign', OFFICER_ID)).toBe(rateLimitKey('upload_sign', OFFICER_ID));
    expect(rateLimitKey('upload_sign', OFFICER_ID)).not.toBe(
      rateLimitKey('upload_finalize', OFFICER_ID),
    );
    expect(rateLimitKey('upload_sign', OFFICER_ID)).not.toBe(rateLimitKey('upload_sign', 'other'));
  });
});

describe('withinRateLimits', () => {
  it('counts a hit under the limit of docs/Security.md §8.3', async () => {
    const { client, hits } = limiterClient({ profile: 'normal' });

    await expect(
      withinRateLimits(client, [{ name: 'upload_sign', subject: OFFICER_ID }]),
    ).resolves.toBe(true);
    expect(hits).toEqual([
      { p_key: rateLimitKey('upload_sign', OFFICER_ID), p_limit: 60, p_window_seconds: 3600 },
    ]);
  });

  it('refuses once the window is used up', async () => {
    const { client } = limiterClient();
    const checks = [{ name: 'upload_forbidden', subject: OFFICER_ID }] as const;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(withinRateLimits(client, checks)).resolves.toBe(true);
    }
    await expect(withinRateLimits(client, checks)).resolves.toBe(false);
  });

  it('halves every limit under the strict profile', async () => {
    const { client, hits } = limiterClient({ profile: 'strict' });

    await withinRateLimits(client, [
      { name: 'upload_finalize', subject: OFFICER_ID },
      { name: 'upload_forbidden', subject: OFFICER_ID },
    ]);

    expect(hits.map((hit) => hit.p_limit)).toEqual([150, 5]);
  });

  it('counts every check and passes only when all of them pass', async () => {
    const { client, hits } = limiterClient();
    const checks = [
      { name: 'upload_sign', subject: OFFICER_ID },
      { name: 'upload_forbidden', subject: OFFICER_ID },
    ] as const;
    for (let attempt = 0; attempt < 10; attempt += 1) await withinRateLimits(client, checks);

    await expect(withinRateLimits(client, checks)).resolves.toBe(false);
    expect(hits).toHaveLength(22);
  });

  it('fails closed: an outage refuses by passing the error on', async () => {
    const { client } = limiterClient({ isDown: true });

    await expect(
      withinRateLimits(client, [{ name: 'upload_sign', subject: OFFICER_ID }]),
    ).rejects.toBeDefined();
  });

  it('fails closed when any of the checks does, even next to a fail-open one', async () => {
    const { client } = limiterClient({ isDown: true });

    await expect(
      withinRateLimits(client, [
        { name: 'booklet:download', subject: '203.0.113.7' },
        { name: 'upload_sign', subject: OFFICER_ID },
      ]),
    ).rejects.toBeDefined();
  });

  it('fails open only when every check is a fail-open limit', async () => {
    const { client } = limiterClient({ isDown: true });

    await expect(
      withinRateLimits(client, [{ name: 'booklet:download', subject: '203.0.113.7' }]),
    ).resolves.toBe(true);
  });
});

describe('isFirstRefusal', () => {
  it('answers true once per window, under a bucket of its own', async () => {
    const { client, hits } = limiterClient();
    const check = { name: 'upload_sign', subject: OFFICER_ID } as const;

    await expect(isFirstRefusal(client, check)).resolves.toBe(true);
    await expect(isFirstRefusal(client, check)).resolves.toBe(false);
    expect(hits[0]).toEqual({
      p_key: `${rateLimitKey('upload_sign', OFFICER_ID)}:refused`,
      p_limit: 1,
      p_window_seconds: 3600,
    });
  });
});
