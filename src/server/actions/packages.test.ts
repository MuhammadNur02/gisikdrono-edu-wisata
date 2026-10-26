import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { packagesCopy } from '@/lib/copy/packages';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { readPackageForStaff } from '@/server/services/package-service';
import {
  archivePackage,
  createPackage,
  updatePackage,
} from '@/server/services/package-write-service';
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
vi.mock('@/server/services/package-service', () => ({ readPackageForStaff: vi.fn() }));
vi.mock('@/server/services/package-write-service', () => ({
  archivePackage: vi.fn(),
  createPackage: vi.fn(),
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
  legRwIds: [],
};
const COMBO_FORM = { ...FORM, category: 'combo', legRwIds: [5, 8] };

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
    expect(createPackage).toHaveBeenCalledWith(5, expect.anything());
    expect(revalidateTag).toHaveBeenCalledWith('packages:all');
  });

  it('files the superadmin package under the RW the RwSwitcher points at, and asks for one under Semua', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    cookie.value = '8';
    await createPackageAction(FORM);
    expect(createPackage).toHaveBeenCalledWith(8, expect.anything());
    cookie.value = undefined;
    expect(await createPackageAction(FORM)).toMatchObject({ error: { code: 'STATE_INVALID' } });
  });

  it('leaves combos to the superadmin, who files them under the kelurahan', async () => {
    expect(await createPackageAction(COMBO_FORM)).toMatchObject({
      error: { code: 'FORBIDDEN', message: packagesCopy.comboOnlySuper },
    });
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    await createPackageAction(COMBO_FORM);
    expect(createPackage).toHaveBeenCalledWith(null, expect.anything());
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
      error: { code: 'FORBIDDEN', message: packagesCopy.comboReadOnly },
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
      error: { code: 'STATE_INVALID', message: packagesCopy.errors.categoryLocked },
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
    expect(updatePackage).toHaveBeenCalledWith(ADMIN_05, expect.anything());
    expect(await archivePackageAction({ id: PACKAGE_ID })).toEqual({ ok: true, data: null });
    expect(archivePackage).toHaveBeenCalledWith(ADMIN_05, PACKAGE_ID);
  });

  it('answers 404 for a package RLS does not show', async () => {
    vi.mocked(readPackageForStaff).mockResolvedValue(null);
    expect(await archivePackageAction({ id: PACKAGE_ID })).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  // tour_packages_legs_guard, the guard half: a combo goes on sale only once its saved legs visit two RWs.
  it('keeps a combo whose route visits fewer than two RWs off sale, new or edited, on the route field', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    const publish = { ...COMBO_FORM, status: 'published' };
    expect(await createPackageAction({ ...publish, legRwIds: [5] })).toMatchObject({
      error: {
        code: 'VALIDATION',
        fieldErrors: { legRwIds: [packagesCopy.validation.legsTooFew] },
      },
    });
    vi.mocked(readPackageForStaff).mockResolvedValue(COMBO);
    expect(await updatePackageAction({ ...publish, id: PACKAGE_ID, legRwIds: [5] })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(createPackage).not.toHaveBeenCalled();
    expect(updatePackage).not.toHaveBeenCalled();
    expect(
      await updatePackageAction({ ...publish, id: PACKAGE_ID, legRwIds: [5, 8] }),
    ).toMatchObject({ ok: true });
    expect(updatePackage).toHaveBeenCalledWith(
      SUPERADMIN,
      expect.objectContaining({ legRwIds: [5, 8] }),
    );
  });

  it("maps the database's publish refusal to the package's own words", async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    vi.mocked(readPackageForStaff).mockResolvedValue(COMBO);
    const refusal = Object.assign(new Error('a combo package needs legs'), {
      code: 'P0001',
      hint: 'STATE_INVALID',
    });
    vi.mocked(updatePackage).mockRejectedValue(refusal);
    expect(await updatePackageAction({ ...COMBO_FORM, id: PACKAGE_ID })).toMatchObject({
      error: { code: 'STATE_INVALID', message: packagesCopy.errors.comboNeedsLegs },
    });
  });
});
