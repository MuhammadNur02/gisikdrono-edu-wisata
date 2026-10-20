import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRateLimitHit } from '@/db/rpc';
import { rateLimitKey } from '@/lib/rate-limit';

import { canResetPassword, withinPasswordResetLimits, withinSignInLimits } from './staff-service';

const profile = vi.hoisted(() => ({
  row: null as { role: string; is_active: boolean } | null,
  queriedEmail: '',
}));

// The service-role client as this module uses it: one profile by email, the rate_limit_profile setting, the limiter.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: () => {
            if (table === 'profiles') profile.queriedEmail = value;
            const data = table === 'profiles' ? profile.row : null;
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    }),
  }),
}));
vi.mock('@/db/rpc', () => ({ svcRateLimitHit: vi.fn() }));

beforeEach(() => {
  profile.row = null;
  vi.mocked(svcRateLimitHit).mockReset().mockResolvedValue(true);
});

describe('canResetPassword', () => {
  it('allows an active account that finished onboarding', async () => {
    profile.row = { role: 'admin_rw', is_active: true };

    expect(await canResetPassword('admin-rw05@dev.gisikdrono.test')).toBe(true);
    expect(profile.queriedEmail).toBe('admin-rw05@dev.gisikdrono.test');
  });

  it.each([
    ['an unknown address', null],
    ['an invited account that never finished onboarding', { role: 'none', is_active: false }],
    ['a deactivated account', { role: 'none', is_active: false }],
    ['an account switched off but still holding a role', { role: 'superadmin', is_active: false }],
  ])('refuses %s', async (_case, row) => {
    profile.row = row;

    expect(await canResetPassword('someone@dev.gisikdrono.test')).toBe(false);
  });
});

describe('sign-in and reset limits', () => {
  it('counts one IPv6 /64 as one IP, so rotating addresses inside it does not help', async () => {
    await withinSignInLimits('2001:db8:1:2::1', 'a@b.test');
    await withinSignInLimits('2001:db8:1:2:ffff::9', 'a@b.test');

    const [first, second] = vi
      .mocked(svcRateLimitHit)
      .mock.calls.filter((_call, index) => index % 2 === 0);
    expect(first?.[1].key).toBe(rateLimitKey('login:ip', '2001:db8:1:2::/64'));
    expect(second?.[1].key).toBe(first?.[1].key);
  });

  it('counts per IP and per IP with the normalised address', async () => {
    await withinSignInLimits('203.0.113.7', 'A.Budi+x@Gmail.com');

    expect(vi.mocked(svcRateLimitHit).mock.calls.map(([, hit]) => hit)).toEqual([
      { key: rateLimitKey('login:ip', '203.0.113.7'), limit: 10, windowSeconds: 300 },
      {
        key: rateLimitKey('login:ip+email', '203.0.113.7|abudi@gmail.com'),
        limit: 5,
        windowSeconds: 900,
      },
    ]);
  });

  it('counts resets per IP and per address, three an hour each', async () => {
    await withinPasswordResetLimits('203.0.113.7', 'a@b.test');

    expect(vi.mocked(svcRateLimitHit).mock.calls.map(([, hit]) => hit)).toEqual([
      { key: rateLimitKey('password_reset:ip', '203.0.113.7'), limit: 3, windowSeconds: 3600 },
      { key: rateLimitKey('password_reset:email', 'a@b.test'), limit: 3, windowSeconds: 3600 },
    ]);
  });
});
