import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  archivePackage,
  createPackage,
  readPackageForStaff,
  updatePackage,
} from '@/server/services/package-service';
import type { PackageAdmin } from '@/types/package';

import { archivePackageAction, createPackageAction, updatePackageAction } from './packages';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('@/server/services/rw-unit-service', () => ({
  listRwUnitsForStaff: () => Promise.resolve([{ id: 5 }, { id: 8 }, { id: 13 }]),
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/package-service', () => ({
  archivePackage: vi.fn(),
  createPackage: vi.fn(),
  readPackageForStaff: vi.fn(),
  updatePackage: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const PACKAGE_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const FORM = {
  name: 'Jelajah Ecowastreme',
  slug: 'jelajah-ecowastreme',
  category: 'regular',
  tagline: '',
  descriptionMd: '',
  highlights: [],
  inclusions: [],
  itinerary: [],
  durationMinutes: 120,
  pricingBasis: 'per_pax',
  pricePerPax: 25_000,
  flatPrice: null,
  minPax: 10,
  maxPax: 60,
  imagePaths: [],
  isFeatured: false,
  status: 'draft',
  sortOrder: 0,
  validFrom: null,
  validTo: null,
  priceTiers: [],
  legs: [],
};
const leg = (rwId: number) => ({ rwId, durationMinutes: null, notes: '' });
const COMBO_FORM = { ...FORM, category: 'combo', legs: [leg(5), leg(8)] };

function stored(change: Partial<PackageAdmin> = {}): PackageAdmin {
  return {
    id: PACKAGE_ID,
    rwId: 5,
    slug: FORM.slug,
    name: FORM.name,
    category: 'regular',
    rwIds: [5],
    pricingBasis: 'per_pax',
    pricePerPax: 25_000,
    flatPrice: null,
    minPax: 10,
    maxPax: 60,
    status: 'draft',
    isFeatured: false,
    updatedAt: '2026-10-24T01:00:00Z',
    tagline: null,
    descriptionMd: null,
    highlights: [],
    inclusions: [],
    itinerary: [],
    durationMinutes: 120,
    imagePaths: [],
    sortOrder: 0,
    validFrom: null,
    validTo: null,
    legs: [{ rwId: 5, legOrder: 1, durationMinutes: null, notes: null }],
    priceTiers: [],
    ...change,
  };
}

const COMBO = stored({ rwId: null, category: 'combo', rwIds: [5, 8] });

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  vi.mocked(createPackage).mockReset().mockResolvedValue(stored());
  vi.mocked(updatePackage).mockReset().mockResolvedValue({ value: stored(), filesRemoved: true });
  vi.mocked(archivePackage).mockReset().mockResolvedValue(undefined);
  vi.mocked(readPackageForStaff).mockReset().mockResolvedValue(stored());
  vi.mocked(revalidateTag).mockReset();
});

describe('package actions', () => {
  it("files an RW admin's package under their own RW, whatever the scope cookie says", async () => {
    cookie.value = '8';
    expect(await createPackageAction(FORM)).toMatchObject({ ok: true });
    expect(createPackage).toHaveBeenCalledWith(ADMIN_05, 5, expect.anything());
    expect(revalidateTag).toHaveBeenCalledWith('packages:all');
  });

  it('files the superadmin package under the RW the RwSwitcher points at, and asks for one under Semua', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    cookie.value = '8';
    await createPackageAction(FORM);
    expect(createPackage).toHaveBeenCalledWith(SUPERADMIN, 8, expect.anything());
    cookie.value = undefined;
    expect(await createPackageAction(FORM)).toMatchObject({ error: { code: 'STATE_INVALID' } });
  });

  it('leaves combos to the superadmin, who files them under the kelurahan', async () => {
    expect(await createPackageAction(COMBO_FORM)).toMatchObject({
      error: { code: 'FORBIDDEN', message: copy.packages.comboOnlySuper },
    });
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    await createPackageAction(COMBO_FORM);
    expect(createPackage).toHaveBeenCalledWith(SUPERADMIN, null, expect.anything());
  });

  it('refuses a form that names the owner RW or the creator', async () => {
    for (const extra of [{ rwId: 8 }, { createdBy: 'user-2' }]) {
      expect(await createPackageAction({ ...FORM, ...extra })).toMatchObject({
        error: { code: 'VALIDATION' },
      });
    }
    expect(createPackage).not.toHaveBeenCalled();
  });

  // The guard half of the cross-RW proof; RLS refuses the same write in the database.
  it("refuses an RW 05 admin another RW's package and any combo", async () => {
    vi.mocked(readPackageForStaff).mockResolvedValue(stored({ rwId: 8 }));
    expect(await updatePackageAction({ ...FORM, id: PACKAGE_ID })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(readPackageForStaff).mockResolvedValue(COMBO);
    expect(await updatePackageAction({ ...COMBO_FORM, id: PACKAGE_ID })).toMatchObject({
      error: { code: 'FORBIDDEN', message: copy.packages.comboReadOnly },
    });
    expect(await archivePackageAction({ id: PACKAGE_ID })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(updatePackage).not.toHaveBeenCalled();
    expect(archivePackage).not.toHaveBeenCalled();
  });

  it('never turns an RW package into a combo or back', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    expect(await updatePackageAction({ ...COMBO_FORM, id: PACKAGE_ID })).toMatchObject({
      error: { code: 'STATE_INVALID', message: copy.packages.errors.categoryLocked },
    });
    vi.mocked(readPackageForStaff).mockResolvedValue(COMBO);
    expect(await updatePackageAction({ ...FORM, id: PACKAGE_ID })).toMatchObject({
      error: { code: 'STATE_INVALID' },
    });
    expect(updatePackage).not.toHaveBeenCalled();
  });

  it("saves the RW admin's own package and archives it by status", async () => {
    const current = stored();
    vi.mocked(readPackageForStaff).mockResolvedValue(current);
    expect(await updatePackageAction({ ...FORM, id: PACKAGE_ID })).toMatchObject({ ok: true });
    expect(updatePackage).toHaveBeenCalledWith(ADMIN_05, current, expect.anything());
    expect(await archivePackageAction({ id: PACKAGE_ID })).toEqual({ ok: true, data: null });
    expect(archivePackage).toHaveBeenCalledWith(ADMIN_05, PACKAGE_ID);
  });

  it('answers 404 for a package RLS does not show', async () => {
    vi.mocked(readPackageForStaff).mockResolvedValue(null);
    expect(await archivePackageAction({ id: PACKAGE_ID })).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});
