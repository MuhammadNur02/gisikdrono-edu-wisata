import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffContext } from '@/server/auth/guards';

import {
  canManageSchedules,
  canWriteFor,
  listedOwners,
  ownerOfNewContent,
  requireNewContentOwner,
  scheduleRwFor,
} from './content-owner';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));

const BASE: Omit<StaffContext, 'role' | 'rwId'> = {
  userId: 'user-1',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };

beforeEach(() => {
  cookie.value = undefined;
});

describe('ownerOfNewContent', () => {
  // The task's rule: an RW admin's RW never comes from a form, and the superadmin's comes from the RwSwitcher only.
  it("gives an RW admin their own RW whatever the RW scope says, since only the superadmin's counts", () => {
    expect(ownerOfNewContent(ADMIN_05, 8)).toBe(5);
    expect(ownerOfNewContent(ADMIN_05, 'all')).toBe(5);
  });

  it('gives the superadmin the RW the RwSwitcher points at, and the kelurahan under Semua', () => {
    expect(ownerOfNewContent(SUPERADMIN, 8)).toBe(8);
    expect(ownerOfNewContent(SUPERADMIN, 'all')).toBeNull();
  });

  it('gives an account without a staff role, or an RW admin without an RW, nothing', () => {
    expect(ownerOfNewContent({ ...BASE, role: 'none', rwId: null }, 5)).toBeUndefined();
    expect(ownerOfNewContent({ ...ADMIN_05, rwId: null }, 5)).toBeUndefined();
  });

  it('gives the admin of an RW added later their RW as well, since the RWs are data', () => {
    expect(ownerOfNewContent({ ...ADMIN_05, rwId: 13 }, 'all')).toBe(13);
  });
});

describe('listedOwners', () => {
  it('lists every RW of rw_units and the kelurahan for the superadmin under Semua', () => {
    expect(listedOwners(SUPERADMIN, 'all', [5, 8, 13])).toEqual([5, 8, 13, null]);
    expect(listedOwners(SUPERADMIN, 8, [5, 8, 13])).toEqual([8]);
  });

  it("lists an RW admin's own RW only", () => {
    expect(listedOwners(ADMIN_05, 'all', [5, 8, 13])).toEqual([5]);
  });
});

describe('performance schedules', () => {
  const ADMIN_08: StaffContext = { ...ADMIN_05, rwId: 8 };

  it('are managed by the superadmin and the admins of RWs with schedule_enabled', () => {
    expect(canManageSchedules(SUPERADMIN, [])).toBe(true);
    expect(canManageSchedules(ADMIN_08, [8])).toBe(true);
    expect(canManageSchedules(ADMIN_05, [8])).toBe(false);
    expect(canManageSchedules({ ...BASE, role: 'none', rwId: null }, [8])).toBe(false);
  });

  it("belong to an admin's own RW, and to the superadmin's chosen or only schedule RW", () => {
    expect(scheduleRwFor(ADMIN_08, 'all', [8])).toBe(8);
    expect(scheduleRwFor(ADMIN_05, 'all', [8])).toBeUndefined();
    expect(scheduleRwFor(SUPERADMIN, 'all', [8])).toBe(8);
    expect(scheduleRwFor(SUPERADMIN, 5, [8])).toBe(8);
    expect(scheduleRwFor(SUPERADMIN, 'all', [8, 13])).toBeUndefined();
    expect(scheduleRwFor(SUPERADMIN, 13, [8, 13])).toBe(13);
    expect(scheduleRwFor(SUPERADMIN, 'all', [])).toBeUndefined();
  });
});

describe('canWriteFor', () => {
  it("lets an RW admin write their own RW's rows only, never the kelurahan's or RW 08's", () => {
    expect(canWriteFor(ADMIN_05, 5)).toBe(true);
    expect(canWriteFor(ADMIN_05, 8)).toBe(false);
    expect(canWriteFor(ADMIN_05, null)).toBe(false);
  });

  it('lets the superadmin write every row', () => {
    expect(canWriteFor(SUPERADMIN, 8)).toBe(true);
    expect(canWriteFor(SUPERADMIN, null)).toBe(true);
  });
});

describe('requireNewContentOwner', () => {
  it('reads the RwSwitcher cookie for the superadmin', async () => {
    cookie.value = '8';
    expect(await requireNewContentOwner(SUPERADMIN, { rwOnly: false })).toEqual({
      ok: true,
      owner: 8,
    });
  });

  it('ignores a scope cookie an RW admin wrote by hand', async () => {
    cookie.value = '8';
    expect(await requireNewContentOwner(ADMIN_05, { rwOnly: true })).toEqual({
      ok: true,
      owner: 5,
    });
  });

  it('asks the superadmin to pick an RW first for content that always belongs to one', async () => {
    expect(await requireNewContentOwner(SUPERADMIN, { rwOnly: true })).toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID' },
    });
  });
});
