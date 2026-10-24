import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { staffCopy } from '@/lib/copy/staff';
import { fail } from '@/lib/errors';
import { requireFreshTotp, requireRole, type StaffContext } from '@/server/auth/guards';
import {
  cancelStaffPromotion,
  changeStaffRole,
  changeStaffStatus,
  createStaffInvite,
  revokeStaffInvite,
} from '@/server/services/staff-admin-service';
import { withinInviteLimit } from '@/server/services/staff-service';

import {
  cancelSuperadminPromotionAction,
  inviteStaffAction,
  revokeStaffInviteAction,
  setStaffRoleAction,
  setStaffStatusAction,
} from './staff';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn(), requireFreshTotp: vi.fn() }));
vi.mock('@/server/services/staff-admin-service', () => ({
  cancelStaffPromotion: vi.fn(),
  changeStaffRole: vi.fn(),
  changeStaffStatus: vi.fn(),
  createStaffInvite: vi.fn(),
  revokeStaffInvite: vi.fn(),
}));
vi.mock('@/server/services/staff-service', () => ({ withinInviteLimit: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const SELF_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';
const OTHER_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000b2';
const INVITE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000c3';
const SUPERADMIN: StaffContext = {
  userId: SELF_ID,
  role: 'superadmin',
  rwId: null,
  isAal2: true,
  totpVerifiedAt: 1_000,
  claimsVersion: 1,
};
const SERVICES = [
  cancelStaffPromotion,
  changeStaffRole,
  changeStaffStatus,
  createStaffInvite,
  revokeStaffInvite,
];

beforeEach(() => {
  vi.mocked(requireRole).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(requireFreshTotp).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  for (const service of SERVICES) vi.mocked(service).mockReset();
  vi.mocked(revalidatePath).mockReset();
  vi.mocked(withinInviteLimit).mockReset().mockResolvedValue(true);
});

describe('inviteStaffAction', () => {
  const INVITE = { email: 'Petugas@Gisikdrono.id', role: 'admin_rw', rwId: 5 };

  it('creates the invite with a fresh TOTP check and hands the code back once', async () => {
    const issued = {
      inviteCode: 'ABCDEFGHJKMNPQRSTVWX',
      expiresAt: '2026-10-27T08:00:00Z',
      acceptableAfter: null,
    };
    vi.mocked(createStaffInvite).mockResolvedValue(issued);
    await expect(inviteStaffAction(INVITE)).resolves.toEqual({ ok: true, data: issued });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(requireFreshTotp).toHaveBeenCalledWith(300);
    expect(createStaffInvite).toHaveBeenCalledWith(SUPERADMIN, {
      email: 'petugas@gisikdrono.id',
      role: 'admin_rw',
      rwId: 5,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/users');
  });

  it('refuses an invalid form before any guard', async () => {
    const result = await inviteStaffAction({ ...INVITE, rwId: null });
    expect(result.ok).toBe(false);
    expect(requireRole).not.toHaveBeenCalled();
  });

  it('refuses an RW admin and anyone without a fresh code, before the service', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(inviteStaffAction(INVITE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(requireFreshTotp).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(inviteStaffAction(INVITE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', message: staffCopy.notFresh },
    });
    expect(createStaffInvite).not.toHaveBeenCalled();
  });
});

describe('setStaffRoleAction and setStaffStatusAction', () => {
  it('never act on the superadmin’s own row', async () => {
    const role = await setStaffRoleAction({ userId: SELF_ID, role: 'admin_rw', rwId: 5 });
    const status = await setStaffStatusAction({
      userId: SELF_ID,
      isActive: false,
      reason: 'Pindah tugas',
    });
    for (const result of [role, status]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN', message: staffCopy.ownRow },
      });
    }
    expect(changeStaffRole).not.toHaveBeenCalled();
    expect(changeStaffStatus).not.toHaveBeenCalled();
  });

  it('changes another account’s role and reports a promotion that waits', async () => {
    const change = { stage: 'requested', completesAfter: '2026-10-25T08:00:00Z' } as const;
    vi.mocked(changeStaffRole).mockResolvedValue(change);
    await expect(
      setStaffRoleAction({ userId: OTHER_ID, role: 'superadmin', rwId: null }),
    ).resolves.toEqual({
      ok: true,
      data: change,
    });
    expect(changeStaffRole).toHaveBeenCalledWith({
      userId: OTHER_ID,
      role: 'superadmin',
      rwId: null,
    });
  });

  it('deactivates another account with its reason and the request id for the ban', async () => {
    vi.mocked(changeStaffStatus).mockResolvedValue({ isBanApplied: true });
    await expect(
      setStaffStatusAction({ userId: OTHER_ID, isActive: false, reason: ' Pindah tugas ' }),
    ).resolves.toEqual({ ok: true, data: { isBanApplied: true } });
    expect(changeStaffStatus).toHaveBeenCalledWith(
      { userId: OTHER_ID, isActive: false, reason: 'Pindah tugas' },
      'request-1',
    );
  });
});

describe('revokeStaffInviteAction and cancelSuperadminPromotionAction', () => {
  it('revoke an invite and cancel a promotion after the same checks', async () => {
    await expect(revokeStaffInviteAction({ inviteId: INVITE_ID })).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(revokeStaffInvite).toHaveBeenCalledWith(INVITE_ID);
    await expect(cancelSuperadminPromotionAction({ userId: OTHER_ID })).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(cancelStaffPromotion).toHaveBeenCalledWith(OTHER_ID);
    expect(requireFreshTotp).toHaveBeenCalledTimes(2);
  });

  it('turn a refusal from below into an ActionResult', async () => {
    const { AppError } = await import('@/lib/errors');
    vi.mocked(revokeStaffInvite).mockRejectedValue(new AppError('NOT_FOUND', staffCopy.notFound));
    await expect(revokeStaffInviteAction({ inviteId: INVITE_ID })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: staffCopy.notFound },
    });
  });
});

// L2 of the PR #43 review: invites per superadmin, fail-closed.
describe('inviteStaffAction limit', () => {
  it('counts invites by the superadmin’s own id and refuses past the limit, before the service', async () => {
    vi.mocked(withinInviteLimit).mockResolvedValueOnce(false);
    await expect(
      inviteStaffAction({ email: 'a@b.id', role: 'admin_rw', rwId: 5 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(withinInviteLimit).toHaveBeenCalledWith(SELF_ID);
    expect(createStaffInvite).not.toHaveBeenCalled();
  });
});
