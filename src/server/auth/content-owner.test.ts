import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffContext } from '@/server/auth/guards';

import { canWriteFor, ownerOfNewContent, requireNewContentOwner } from './content-owner';

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
    expect(ownerOfNewContent({ ...ADMIN_05, rwId: 7 }, 5)).toBeUndefined();
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
