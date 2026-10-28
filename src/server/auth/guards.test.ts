import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasUploadAccess,
  readStaffSession,
  requireAal2,
  requireFreshTotp,
  requireRole,
  requireRwAccess,
  requireGuestToken,
  requireUser,
  type StaffContext,
} from '@/server/auth/guards';
import { verifyGuestAccess } from '@/server/services/booking-service';

const session = vi.hoisted(() => ({
  user: null as { id: string; factors?: { factor_type: string; status: string }[] } | null,
  claims: null as Record<string, unknown> | null,
}));

const guestCookies = vi.hoisted(() => new Map<string, string>());

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        guestCookies.has(name) ? { value: guestCookies.get(name) } : undefined,
    }),
  headers: () => Promise.resolve(new Headers({ 'x-real-ip': '203.0.113.7' })),
}));
vi.mock('@/server/services/booking-service', () => ({ verifyGuestAccess: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        getUser: () => Promise.resolve({ data: { user: session.user } }),
        getClaims: () =>
          Promise.resolve({ data: session.claims ? { claims: session.claims } : null }),
      },
    }),
}));

const nowSeconds = Math.floor(Date.now() / 1000);

function signInAs(claims: Record<string, unknown>) {
  session.user = { id: 'user-1' };
  session.claims = { sub: 'user-1', aal: 'aal2', ...claims };
}

beforeEach(() => {
  session.user = null;
  session.claims = null;
});

describe('requireUser', () => {
  it('rejects a visitor with no session', async () => {
    expect(await requireUser()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects a deactivated account whose role claim fell back to none', async () => {
    signInAs({ app_role: 'none' });
    expect(await requireUser()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects claims that belong to another user', async () => {
    signInAs({ app_role: 'superadmin', sub: 'someone-else' });
    expect(await requireUser()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('returns the staff context for an active account', async () => {
    signInAs({ app_role: 'admin_rw', app_rw_id: 5 });
    expect(await requireUser()).toEqual({
      ok: true,
      ctx: {
        userId: 'user-1',
        role: 'admin_rw',
        rwId: 5,
        isAal2: true,
        totpVerifiedAt: null,
        claimsVersion: null,
      },
    });
  });

  it('carries the claims_version claim so upload access can compare it with the profile', async () => {
    signInAs({ app_role: 'admin_rw', app_rw_id: 5, claims_version: 3 });
    expect(await requireUser()).toMatchObject({ ok: true, ctx: { claimsVersion: 3 } });
  });
});

describe('requireRole', () => {
  it('lets the superadmin through and stops an RW admin', async () => {
    signInAs({ app_role: 'superadmin' });
    expect((await requireRole('superadmin')).ok).toBe(true);

    signInAs({ app_role: 'admin_rw', app_rw_id: 5 });
    expect(await requireRole('superadmin')).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('requireRole with several roles', () => {
  it('lets either staff role into the dashboard shell and nobody else', async () => {
    signInAs({ app_role: 'admin_rw', app_rw_id: 8 });
    expect((await requireRole('superadmin', 'admin_rw')).ok).toBe(true);

    signInAs({ app_role: 'none' });
    expect(await requireRole('superadmin', 'admin_rw')).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });
});

describe('readStaffSession', () => {
  it('is null without a session', async () => {
    expect(await readStaffSession()).toBeNull();
  });

  it('says whether a TOTP factor is verified and how the session was opened', async () => {
    signInAs({
      app_role: 'admin_rw',
      app_rw_id: 5,
      aal: 'aal1',
      amr: [{ method: 'otp', timestamp: nowSeconds }],
    });
    session.user = {
      id: 'user-1',
      factors: [
        { factor_type: 'totp', status: 'unverified' },
        { factor_type: 'totp', status: 'verified' },
      ],
    };

    expect(await readStaffSession()).toMatchObject({
      ctx: { role: 'admin_rw', isAal2: false },
      hasVerifiedTotp: true,
      authMethods: ['otp'],
    });
  });

  it('does not count a factor whose enrolment was never finished', async () => {
    signInAs({ app_role: 'admin_rw', app_rw_id: 5, aal: 'aal1' });
    session.user = { id: 'user-1', factors: [{ factor_type: 'totp', status: 'unverified' }] };

    expect(await readStaffSession()).toMatchObject({ hasVerifiedTotp: false, authMethods: [] });
  });

  it('keeps a role-less account, so the pages can tell it apart from a signed-out visitor', async () => {
    signInAs({ app_role: 'none' });

    expect(await readStaffSession()).toMatchObject({ ctx: { role: 'none' } });
  });
});

describe('requireRwAccess', () => {
  it('lets an RW 05 admin into RW 05 only', async () => {
    signInAs({ app_role: 'admin_rw', app_rw_id: 5 });
    expect((await requireRwAccess(5)).ok).toBe(true);
    expect(await requireRwAccess(8)).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('lets the superadmin into every RW', async () => {
    signInAs({ app_role: 'superadmin' });
    expect((await requireRwAccess(8)).ok).toBe(true);
  });

  it('stops an RW admin whose RW claim is missing', async () => {
    signInAs({ app_role: 'admin_rw' });
    expect(await requireRwAccess(5)).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('hasUploadAccess', () => {
  const officer05: StaffContext = {
    userId: 'user-1',
    role: 'admin_rw',
    rwId: 5,
    isAal2: true,
    totpVerifiedAt: null,
    claimsVersion: 1,
  };
  const superadmin: StaffContext = { ...officer05, role: 'superadmin', rwId: null };

  it('lets an RW officer upload for their own RW only, and never for the kelurahan', () => {
    expect(hasUploadAccess(officer05, 5)).toBe(true);
    expect(hasUploadAccess(officer05, 8)).toBe(false);
    expect(hasUploadAccess(officer05, null)).toBe(false);
  });

  it('lets the superadmin upload for every RW and the kelurahan', () => {
    expect(hasUploadAccess(superadmin, 8)).toBe(true);
    expect(hasUploadAccess(superadmin, null)).toBe(true);
  });

  it('stops a session that has not passed TOTP, because the service role skips the AAL2 policy', () => {
    expect(hasUploadAccess({ ...officer05, isAal2: false }, 5)).toBe(false);
    expect(hasUploadAccess({ ...superadmin, isAal2: false }, null)).toBe(false);
  });
});

describe('requireAal2', () => {
  it('stops a session that has not passed TOTP yet', async () => {
    signInAs({ app_role: 'superadmin', aal: 'aal1' });
    expect(await requireAal2()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('requireFreshTotp', () => {
  it('accepts a TOTP check from within the window', async () => {
    signInAs({
      app_role: 'superadmin',
      amr: [
        { method: 'password', timestamp: nowSeconds - 3600 },
        { method: 'totp', timestamp: nowSeconds - 60 },
      ],
    });
    expect((await requireFreshTotp(300)).ok).toBe(true);
  });

  it('rejects a TOTP check older than the window, or none at all', async () => {
    signInAs({ app_role: 'superadmin', amr: [{ method: 'totp', timestamp: nowSeconds - 301 }] });
    expect(await requireFreshTotp(300)).toMatchObject({ error: { code: 'FORBIDDEN' } });

    signInAs({ app_role: 'superadmin', amr: [{ method: 'password', timestamp: nowSeconds }] });
    expect(await requireFreshTotp(300)).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('requireGuestToken', () => {
  const CODE = 'GSK-7F3K9Q2M';
  const ACCESS = { bookingId: 'b-1', bookingCode: CODE, scope: 'manage' as const, tokenVersion: 1 };

  beforeEach(() => {
    guestCookies.clear();
    vi.mocked(verifyGuestAccess).mockReset().mockResolvedValue(ACCESS);
  });

  it('opens with the cookie of this booking, checked against the scope the page needs', async () => {
    guestCookies.set(`bk_${CODE}`, 'token-1');
    expect(await requireGuestToken(CODE, 'view')).toEqual({ ok: true, guest: ACCESS });
    expect(verifyGuestAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingCode: CODE,
        token: 'token-1',
        required: 'view',
        clientIp: '203.0.113.7',
      }),
    );
  });

  it('reads a review page from the review link’s own cookie, never from the manage link’s', async () => {
    guestCookies.set(`bk_${CODE}`, 'manage-token');
    expect(await requireGuestToken(CODE, 'review')).toMatchObject({ ok: false });
    guestCookies.set(`bk_${CODE}_review`, 'review-token');
    await requireGuestToken(CODE, 'review');
    expect(verifyGuestAccess).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'review-token' }),
    );
  });

  it('answers the same NOT_FOUND for no cookie, a cookie of another booking, a bad code, a refusal or an outage', async () => {
    guestCookies.set('bk_GSK-7F3K9Q2N', 'token-2');
    const notFound = { ok: false, error: { code: 'NOT_FOUND' } };
    expect(await requireGuestToken(CODE, 'view')).toMatchObject(notFound);
    expect(await requireGuestToken('gsk-7f3k9q2m', 'view')).toMatchObject(notFound);
    expect(verifyGuestAccess).not.toHaveBeenCalled();

    guestCookies.set(`bk_${CODE}`, 'token-1');
    vi.mocked(verifyGuestAccess).mockResolvedValueOnce(null);
    expect(await requireGuestToken(CODE, 'manage')).toMatchObject(notFound);
    vi.mocked(verifyGuestAccess).mockRejectedValueOnce(new Error('database down'));
    expect(await requireGuestToken(CODE, 'manage')).toMatchObject(notFound);
  });
});
