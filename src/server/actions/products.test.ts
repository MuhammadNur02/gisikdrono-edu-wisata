import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { productsCopy } from '@/lib/copy/products';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  archiveProduct,
  createProduct,
  readProductForStaff,
  updateProduct,
} from '@/server/services/product-service';
import { createVendor, readVendorForStaff, updateVendor } from '@/server/services/vendor-service';
import type { ProductAdmin } from '@/types/product';
import type { VendorAdmin } from '@/types/vendor';

import { archiveProductAction, createProductAction, updateProductAction } from './products';
import { createVendorAction, updateVendorAction } from './vendors';

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
vi.mock('@/server/services/product-service', () => ({
  archiveProduct: vi.fn(),
  createProduct: vi.fn(),
  readProductForStaff: vi.fn(),
  updateProduct: vi.fn(),
}));
vi.mock('@/server/services/vendor-service', () => ({
  createVendor: vi.fn(),
  readVendorForStaff: vi.fn(),
  updateVendor: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const ROW_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const FORM = {
  vendorId: ROW_ID,
  name: 'Kompos Organik 1 kg',
  slug: 'kompos-organik-1-kg',
  category: 'compost',
  descriptionMd: '',
  price: 15_000,
  unitLabel: 'kg',
  minOrderQty: 1,
  maxOrderQty: null,
  leadTimeDays: 2,
  isAddonEligible: false,
  isAvailable: true,
  isFeatured: false,
  imagePaths: [],
  status: 'draft',
  sortOrder: 0,
  variants: [],
};
const VENDOR_FORM = {
  name: 'PKK RW 05',
  slug: 'pkk-rw-05',
  ownerName: '',
  phone: '',
  descriptionMd: '',
  isActive: true,
};

function vendorOf(rwId: number): VendorAdmin {
  return {
    id: ROW_ID,
    rwId,
    slug: 'pkk-rw-05',
    name: 'PKK',
    ownerName: null,
    phone: null,
    descriptionMd: null,
    isActive: true,
  };
}

function stored(rwId: number): ProductAdmin {
  return {
    id: ROW_ID,
    rwId,
    vendorId: ROW_ID,
    vendorName: 'PKK',
    slug: FORM.slug,
    name: FORM.name,
    category: 'compost',
    price: 15_000,
    unitLabel: 'kg',
    status: 'draft',
    isAddonEligible: false,
    isAvailable: true,
    isFeatured: false,
    updatedAt: '2026-10-24T01:00:00Z',
    descriptionMd: null,
    minOrderQty: 1,
    maxOrderQty: null,
    leadTimeDays: 2,
    imagePaths: [],
    sortOrder: 0,
    variants: [],
  };
}

beforeEach(() => {
  cookie.value = '5';
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(createProduct).mockReset().mockResolvedValue(stored(5));
  vi.mocked(updateProduct)
    .mockReset()
    .mockResolvedValue({ value: stored(5), filesRemoved: true });
  vi.mocked(archiveProduct).mockReset().mockResolvedValue(undefined);
  vi.mocked(readProductForStaff).mockReset().mockResolvedValue(stored(5));
  vi.mocked(readVendorForStaff).mockReset().mockResolvedValue(vendorOf(5));
  vi.mocked(createVendor).mockReset().mockResolvedValue(vendorOf(5));
  vi.mocked(updateVendor).mockReset().mockResolvedValue(vendorOf(5));
  vi.mocked(revalidateTag).mockReset();
});

describe('product and vendor actions', () => {
  // Decision of the user, 2026-10-24: entry is the superadmin's, an RW admin reads only.
  it('refuses every write to an RW admin, even for their own RW', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: ADMIN_05 });
    const results = [
      await createProductAction(FORM),
      await updateProductAction({ ...FORM, id: ROW_ID }),
      await archiveProductAction({ id: ROW_ID }),
      await createVendorAction(VENDOR_FORM),
      await updateVendorAction({ ...VENDOR_FORM, id: ROW_ID }),
    ];
    for (const result of results) {
      expect(result).toMatchObject({
        error: { code: 'FORBIDDEN', message: productsCopy.entryOnlySuper },
      });
    }
    expect(createProduct).not.toHaveBeenCalled();
    expect(updateProduct).not.toHaveBeenCalled();
    expect(archiveProduct).not.toHaveBeenCalled();
    expect(createVendor).not.toHaveBeenCalled();
    expect(updateVendor).not.toHaveBeenCalled();
  });

  it('files a new product and vendor under the RW the RwSwitcher points at', async () => {
    cookie.value = '8';
    vi.mocked(readVendorForStaff).mockResolvedValue(vendorOf(8));
    expect(await createProductAction(FORM)).toMatchObject({ ok: true });
    expect(createProduct).toHaveBeenCalledWith(8, expect.anything());
    await createVendorAction(VENDOR_FORM);
    expect(createVendor).toHaveBeenCalledWith(SUPERADMIN, 8, expect.anything());
    expect(revalidateTag).toHaveBeenCalledWith('products:all');
  });

  it('asks for an RW under Semua', async () => {
    cookie.value = undefined;
    expect(await createProductAction(FORM)).toMatchObject({ error: { code: 'STATE_INVALID' } });
    expect(await createVendorAction(VENDOR_FORM)).toMatchObject({
      error: { code: 'STATE_INVALID' },
    });
  });

  it("refuses a vendor of another RW than the product's, under the vendor field", async () => {
    vi.mocked(readVendorForStaff).mockResolvedValue(vendorOf(8));
    expect(await createProductAction(FORM)).toMatchObject({
      error: { code: 'VALIDATION', fieldErrors: { vendorId: [productsCopy.vendorWrongRw] } },
    });
    expect(await updateProductAction({ ...FORM, id: ROW_ID })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(createProduct).not.toHaveBeenCalled();
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('refuses a form that names the RW or a bank column', async () => {
    expect(await createProductAction({ ...FORM, rwId: 8 })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(await createVendorAction({ ...VENDOR_FORM, bankAccountNumber: '1' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
  });

  // Decision of 2026-10-30: a product may wait for its price, and carries its variants.
  it('saves a product without a price, with its variants', async () => {
    const variants = [
      { label: 'Motif Kawung', imagePath: null, isAvailable: true },
      { label: 'Motif Parang', imagePath: null, isAvailable: false },
    ];
    expect(await createProductAction({ ...FORM, price: null, variants })).toMatchObject({
      ok: true,
    });
    expect(createProduct).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ price: null, variants }),
    );
  });

  it('refuses a price of 0 and a variant named twice, under their fields', async () => {
    const twice = [
      { label: 'Biru', imagePath: null, isAvailable: true },
      { label: 'biru', imagePath: null, isAvailable: true },
    ];
    const result = await createProductAction({ ...FORM, price: 0, variants: twice });
    expect(result).toMatchObject({
      error: {
        code: 'VALIDATION',
        fieldErrors: {
          price: [expect.any(String)],
          variants: [productsCopy.variants.duplicate],
        },
      },
    });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('archives by status', async () => {
    expect(await archiveProductAction({ id: ROW_ID })).toEqual({ ok: true, data: null });
    expect(archiveProduct).toHaveBeenCalledWith(ROW_ID);
  });
});
