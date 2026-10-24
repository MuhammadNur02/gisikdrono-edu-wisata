import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setStaffRole, setStaffStatus } from '@/db/rpc';
import { inviteSuperadmin } from '@/db/rpc-staff';
import { staffCopy } from '@/lib/copy/staff';
import { AppError } from '@/lib/errors';
import { inviteCodeHash } from '@/lib/staff-codes';
import type { StaffContext } from '@/server/auth/guards';
import { readStaffAuthStates, setStaffAuthBan } from '@/server/services/staff-service';

import {
  changeStaffRole,
  changeStaffStatus,
  createStaffInvite,
  revokeStaffInvite,
} from './staff-admin-service';

const db = vi.hoisted(() => ({
  existingProfile: null as { id: string } | null,
  inserted: [] as unknown[],
  insertError: null as { code: string } | null,
  revokedRows: [] as { id: string }[],
}));

// The session client as this module uses it: one profile by email, the invite insert and the revoke update.
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: db.existingProfile, error: null }),
          }),
        }),
        insert: (row: unknown) => {
          db.inserted.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'invite-1' }, error: db.insertError }),
            }),
          };
        },
        update: () => {
          const chain = {
            eq: () => chain,
            is: () => chain,
            select: () => Promise.resolve({ data: db.revokedRows, error: null }),
          };
          return chain;
        },
      }),
    }),
}));
vi.mock('@/lib/staff-codes', () => ({
  drawInviteCode: () => 'ABCDEFGHJKMNPQRSTVWX',
  inviteCodeHash: vi.fn(() => 'hash-of-code'),
}));
vi.mock('@/db/rpc', () => ({
  cancelSuperadminPromotion: vi.fn(),
  setStaffRole: vi.fn(),
  setStaffStatus: vi.fn(),
}));
vi.mock('@/db/rpc-staff', () => ({ inviteSuperadmin: vi.fn() }));
vi.mock('@/server/services/staff-service', () => ({
  readStaffAuthStates: vi.fn(),
  setStaffAuthBan: vi.fn(),
}));

const SUPERADMIN: StaffContext = {
  userId: 'super-1',
  role: 'superadmin',
  rwId: null,
  isAal2: true,
  totpVerifiedAt: 1_000,
  claimsVersion: 1,
};
const USER_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000b2';

beforeEach(() => {
  db.existingProfile = null;
  db.inserted = [];
  db.insertError = null;
  db.revokedRows = [{ id: 'invite-1' }];
  vi.mocked(setStaffRole).mockReset();
  vi.mocked(setStaffStatus).mockReset();
  vi.mocked(inviteSuperadmin).mockReset();
  vi.mocked(setStaffAuthBan).mockReset();
  vi.mocked(readStaffAuthStates)
    .mockReset()
    .mockResolvedValue(
      new Map([[USER_ID, { hasVerifiedTotp: true, isBanned: false, lastSignInAt: null }]]),
    );
});

describe('createStaffInvite', () => {
  it('stores only the hash of an RW admin invite and hands the plain code back', async () => {
    const issued = await createStaffInvite(SUPERADMIN, {
      email: 'a@b.id',
      role: 'admin_rw',
      rwId: 5,
    });
    expect(issued.inviteCode).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(issued.acceptableAfter).toBeNull();
    expect(inviteCodeHash).toHaveBeenCalledWith('ABCDEFGHJKMNPQRSTVWX');
    expect(db.inserted).toEqual([
      expect.objectContaining({
        email: 'a@b.id',
        role: 'admin_rw',
        rw_id: 5,
        invite_code_hash: 'hash-of-code',
      }),
    ]);
    expect(JSON.stringify(db.inserted)).not.toContain('ABCDEFGHJKMNPQRSTVWX');
  });

  it('keeps the expiry inside the 72 hours the database allows', async () => {
    const before = Date.now();
    const { expiresAt } = await createStaffInvite(SUPERADMIN, {
      email: 'a@b.id',
      role: 'admin_rw',
      rwId: 5,
    });
    expect(Date.parse(expiresAt) - before).toBeLessThan(72 * 3600 * 1000);
  });

  it('invites a superadmin only through invite_superadmin, which says when it may be accepted', async () => {
    vi.mocked(inviteSuperadmin).mockResolvedValue({
      inviteId: 'invite-2',
      completesAfter: '2026-10-25T08:00:00Z',
      lapsesAfter: '2026-10-27T08:00:00Z',
    });
    const issued = await createStaffInvite(SUPERADMIN, {
      email: 'l@b.id',
      role: 'superadmin',
      rwId: null,
    });
    expect(issued).toEqual({
      inviteCode: 'ABCDEFGHJKMNPQRSTVWX',
      expiresAt: '2026-10-27T08:00:00Z',
      acceptableAfter: '2026-10-25T08:00:00Z',
    });
    expect(db.inserted).toEqual([]);
  });

  it('refuses an address that already has an account or an open invite', async () => {
    db.existingProfile = { id: 'someone' };
    await expect(
      createStaffInvite(SUPERADMIN, { email: 'a@b.id', role: 'admin_rw', rwId: 5 }),
    ).rejects.toEqual(new AppError('CONFLICT', staffCopy.invite.exists));
    db.existingProfile = null;
    db.insertError = { code: '23505' };
    await expect(
      createStaffInvite(SUPERADMIN, { email: 'a@b.id', role: 'admin_rw', rwId: 5 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('revokeStaffInvite', () => {
  it('says so when the invite was already accepted, revoked or never existed', async () => {
    db.revokedRows = [];
    await expect(revokeStaffInvite('invite-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('changeStaffRole and changeStaffStatus', () => {
  it('read the refusals of the staff RPCs as the superadmin’s outcomes', async () => {
    vi.mocked(setStaffRole).mockRejectedValueOnce({ code: '42501' });
    await expect(
      changeStaffRole({ userId: USER_ID, role: 'admin_rw', rwId: 5 }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      userMessage: staffCopy.notFresh,
    });
    vi.mocked(setStaffRole).mockRejectedValueOnce({ code: 'P0001', hint: 'STATE_INVALID' });
    await expect(
      changeStaffRole({ userId: USER_ID, role: 'admin_rw', rwId: 5 }),
    ).rejects.toMatchObject({
      code: 'STATE_INVALID',
    });
  });

  it('passes an unexpected error on unchanged', async () => {
    const outage = new Error('fetch failed');
    vi.mocked(setStaffRole).mockRejectedValueOnce(outage);
    await expect(changeStaffRole({ userId: USER_ID, role: 'admin_rw', rwId: 5 })).rejects.toBe(
      outage,
    );
  });

  it('bans the Auth user only after the profile changed, and reports a failed ban', async () => {
    vi.mocked(setStaffAuthBan).mockResolvedValue(false);
    await expect(
      changeStaffStatus({ userId: USER_ID, isActive: false, reason: 'Pindah tugas' }, 'request-1'),
    ).resolves.toEqual({ isBanApplied: false });
    expect(setStaffAuthBan).toHaveBeenCalledWith(USER_ID, true, 'request-1');

    vi.mocked(setStaffStatus).mockRejectedValueOnce({ code: '42501' });
    vi.mocked(setStaffAuthBan).mockClear();
    await expect(
      changeStaffStatus(
        { userId: USER_ID, isActive: true, reason: 'Kembali bertugas' },
        'request-1',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(setStaffAuthBan).not.toHaveBeenCalled();
  });
});

// M1 of the PR #43 review: a role for an account whose factors deactivation removed would be an MFA reset without
// the re-enrolment code.
describe('changeStaffRole without an authenticator', () => {
  it('refuses a role to an account with no verified TOTP factor, before the RPC', async () => {
    vi.mocked(readStaffAuthStates).mockResolvedValueOnce(
      new Map([[USER_ID, { hasVerifiedTotp: false, isBanned: false, lastSignInAt: null }]]),
    );
    await expect(changeStaffRole({ userId: USER_ID, role: 'admin_rw', rwId: 5 })).rejects.toEqual(
      new AppError('STATE_INVALID', staffCopy.role.noFactor),
    );
    vi.mocked(readStaffAuthStates).mockResolvedValueOnce(new Map());
    await expect(
      changeStaffRole({ userId: USER_ID, role: 'superadmin', rwId: null }),
    ).rejects.toMatchObject({ code: 'STATE_INVALID' });
    expect(setStaffRole).not.toHaveBeenCalled();
  });

  it('gives the role once the account has its factor', async () => {
    vi.mocked(setStaffRole).mockResolvedValueOnce({ stage: 'applied' });
    await expect(changeStaffRole({ userId: USER_ID, role: 'admin_rw', rwId: 5 })).resolves.toEqual({
      stage: 'applied',
    });
    expect(readStaffAuthStates).toHaveBeenCalledWith([USER_ID]);
  });
});
