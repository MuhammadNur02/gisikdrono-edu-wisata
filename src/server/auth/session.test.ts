import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { requireRole, type StaffContext } from '@/server/auth/guards';

import { redirectSignedInStaff, requireDashboardStaff } from './session';

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn() }));

const OFFICER: StaffContext = {
  userId: 'u',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
});

describe('requireDashboardStaff', () => {
  it('lets an AAL2 staff member in', async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: OFFICER });

    expect(await requireDashboardStaff()).toEqual(OFFICER);
    expect(requireRole).toHaveBeenCalledWith('superadmin', 'admin_rw');
  });

  it('sends a signed-out visitor to sign in and an AAL1 session to the TOTP step', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: copy.errors.UNAUTHENTICATED },
    });
    await expect(requireDashboardStaff()).rejects.toMatchObject({ to: '/login' });

    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(requireDashboardStaff()).rejects.toMatchObject({ to: '/mfa/verify' });
  });

  it('is null for an account without a staff role, so the layout can say so', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: copy.errors.FORBIDDEN },
    });

    expect(await requireDashboardStaff()).toBeNull();
  });
});

describe('redirectSignedInStaff', () => {
  const session = { ctx: OFFICER, hasVerifiedTotp: true, authMethods: ['password', 'totp'] };

  it('sends an AAL2 staff member past the sign-in pages, keeping a dashboard page', () => {
    expect(() => {
      redirectSignedInStaff(session, '/dashboard/sessions');
    }).toThrow(new Redirected('/dashboard/sessions'));
  });

  it('sends an AAL1 session to the TOTP step, and lets a visitor or a role-less account stay', () => {
    expect(() => {
      redirectSignedInStaff({ ...session, ctx: { ...OFFICER, isAal2: false } }, undefined);
    }).toThrow(new Redirected('/mfa/verify'));
    expect(() => {
      redirectSignedInStaff(null, undefined);
    }).not.toThrow();
    expect(() => {
      redirectSignedInStaff({ ...session, ctx: { ...OFFICER, role: 'none' } }, undefined);
    }).not.toThrow();
  });
});
