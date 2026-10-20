import { AuthApiError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRateLimitHit } from '@/db/rpc';
import { rateLimitKey } from '@/lib/rate-limit';

import {
  canResetPassword,
  recordSessionRevokeFailure,
  sendPasswordResetEmail,
  withinPasswordResetLimits,
  withinSignInLimits,
} from './staff-service';

const profile = vi.hoisted(() => ({
  row: null as { role: string; is_active: boolean } | null,
  queriedEmail: '',
}));
const resetPasswordForEmail = vi.hoisted(() => vi.fn());
const insertedEvents = vi.hoisted(() => ({ rows: [] as unknown[], error: null as Error | null }));
const logged = vi.hoisted(() => vi.fn());

// The service-role client as this module uses it: one profile by email, the rate_limit_profile setting, the limiter,
// and Supabase Auth's recovery email.
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    auth: { resetPasswordForEmail },
    from: (table: string) => ({
      insert: (row: unknown) => {
        insertedEvents.rows.push({ table, row });
        return Promise.resolve({ error: insertedEvents.error });
      },
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
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: logged, error: logged }),
}));

beforeEach(() => {
  profile.row = null;
  profile.queriedEmail = '';
  vi.mocked(svcRateLimitHit).mockReset().mockResolvedValue(true);
  resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
  logged.mockReset();
  insertedEvents.rows = [];
  insertedEvents.error = null;
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

  // F2 of the PR #17 review: a count by address alone let anyone use up a staff member's resets from anywhere.
  it('counts resets per IP and per IP with the address, never by the address alone', async () => {
    await withinPasswordResetLimits('203.0.113.7', 'A.Budi+x@Gmail.com');

    expect(vi.mocked(svcRateLimitHit).mock.calls.map(([, hit]) => hit)).toEqual([
      { key: rateLimitKey('password_reset:ip', '203.0.113.7'), limit: 10, windowSeconds: 3600 },
      {
        key: rateLimitKey('password_reset:ip+email', '203.0.113.7|abudi@gmail.com'),
        limit: 3,
        windowSeconds: 3600,
      },
    ]);
  });
});

describe('sendPasswordResetEmail', () => {
  const STAFF = 'admin-rw05@dev.gisikdrono.test';

  it('mails an account that may reset, counting the address against its daily ceiling', async () => {
    profile.row = { role: 'admin_rw', is_active: true };

    await sendPasswordResetEmail(STAFF, 'request-1');

    expect(vi.mocked(svcRateLimitHit).mock.calls.map(([, hit]) => hit)).toEqual([
      { key: rateLimitKey('password_reset:email', STAFF), limit: 10, windowSeconds: 86400 },
    ]);
    expect(profile.queriedEmail).toBe(STAFF);
    // The service-role client keeps no session and no PKCE verifier, so the link is the email's token_hash alone.
    expect(resetPasswordForEmail).toHaveBeenCalledWith(STAFF);
  });

  it('mails nobody once an address had its resets for the day, however many IPs asked', async () => {
    profile.row = { role: 'admin_rw', is_active: true };
    vi.mocked(svcRateLimitHit).mockResolvedValue(false);

    await sendPasswordResetEmail(STAFF, 'request-1');

    expect(profile.queriedEmail).toBe('');
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('mails nobody at an address that may not reset', async () => {
    await sendPasswordResetEmail('nobody@example.test', 'request-1');

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('keeps every failure to the log, since the answer has already gone out', async () => {
    profile.row = { role: 'admin_rw', is_active: true };
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: new AuthApiError('refused', 429, 'over_email_send_rate_limit'),
    });
    await expect(sendPasswordResetEmail(STAFF, 'request-1')).resolves.toBeUndefined();

    vi.mocked(svcRateLimitHit).mockRejectedValue(new Error('database unavailable'));
    await expect(sendPasswordResetEmail(STAFF, 'request-1')).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(2);
  });
});

// S1 of the PR #17 review: a global sign-out Supabase Auth could not finish leaves other devices signed in.
describe('recordSessionRevokeFailure', () => {
  const ctx = {
    userId: 'user-1',
    role: 'admin_rw' as const,
    rwId: 5,
    isAal2: false,
    totpVerifiedAt: null,
    claimsVersion: 1,
  };

  it('records a high security event with the flow, by id only', async () => {
    await recordSessionRevokeFailure(ctx, 'password_change', 'request-1');

    expect(insertedEvents.rows).toEqual([
      {
        table: 'security_events',
        row: {
          event_type: 'session_revoke_failed',
          severity: 'high',
          actor_id: 'user-1',
          actor_role: 'admin_rw',
          rw_id: 5,
          entity_type: 'auth_session',
          details: { flow: 'password_change' },
        },
      },
    ]);
  });

  it('keeps a failed write to the log, since the staff member is told either way', async () => {
    insertedEvents.error = new Error('database unavailable');

    await expect(recordSessionRevokeFailure(ctx, 'sign_out', 'request-1')).resolves.toBeUndefined();
    expect(logged).toHaveBeenLastCalledWith('internal_error', {
      source: 'session_revoke_failed',
      errorName: 'Error',
    });
  });
});
