import { describe, expect, it } from 'vitest';

import {
  createProductSchema,
  createVendorSchema,
  updateProductSchema,
  updateVendorSchema,
} from './product';

const ROW_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

const PRODUCT = {
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
};

const VENDOR = {
  name: 'PKK RW 05',
  slug: 'pkk-rw-05',
  ownerName: '',
  phone: '',
  descriptionMd: null,
  isActive: true,
};

describe('createProductSchema', () => {
  it('reads empty text as none and parses its own output again', () => {
    const once = createProductSchema.parse(PRODUCT);
    expect(once.descriptionMd).toBeNull();
    expect(createProductSchema.parse(once)).toEqual(once);
  });

  it('puts a maximum order below the minimum under the maximum', () => {
    const result = createProductSchema.safeParse({ ...PRODUCT, minOrderQty: 5, maxOrderQty: 2 });
    expect(result.error?.issues[0]?.path).toEqual(['maxOrderQty']);
  });

  it('refuses fractional rupiah, a status under review, and an owner RW or creator from the form', () => {
    for (const change of [
      { price: 15_000.5 },
      { status: 'pending_review' },
      { rwId: 5 },
      { createdBy: 'user-1' },
      { id: ROW_ID },
    ]) {
      expect(createProductSchema.safeParse({ ...PRODUCT, ...change }).success).toBe(false);
    }
  });

  it('refuses to make a product an add-on, which the decision of 2026-10-29 switched off', () => {
    expect(createProductSchema.safeParse({ ...PRODUCT, isAddonEligible: true }).success).toBe(
      false,
    );
    expect(
      updateProductSchema.safeParse({ ...PRODUCT, id: ROW_ID, isAddonEligible: true }).success,
    ).toBe(false);
  });

  it('needs the row id to update', () => {
    expect(updateProductSchema.safeParse(PRODUCT).success).toBe(false);
    expect(updateProductSchema.safeParse({ ...PRODUCT, id: ROW_ID }).success).toBe(true);
  });
});

describe('createVendorSchema', () => {
  it('keeps an empty owner and phone as none', () => {
    expect(createVendorSchema.parse(VENDOR)).toMatchObject({ ownerName: null, phone: null });
  });

  it('takes an Indonesian number in E.164 only', () => {
    expect(createVendorSchema.safeParse({ ...VENDOR, phone: '+6281234567890' }).success).toBe(true);
    for (const phone of ['081234567890', '+44123456789', '+62 812']) {
      expect(createVendorSchema.safeParse({ ...VENDOR, phone }).success).toBe(false);
    }
  });

  it('refuses the bank columns and the RW, which no form carries', () => {
    for (const extra of [{ bankAccountNumber: '123' }, { bankName: 'BRI' }, { rwId: 5 }]) {
      expect(createVendorSchema.safeParse({ ...VENDOR, ...extra }).success).toBe(false);
    }
    expect(updateVendorSchema.safeParse({ ...VENDOR, id: ROW_ID }).success).toBe(true);
  });
});
