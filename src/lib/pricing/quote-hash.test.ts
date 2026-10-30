import { describe, expect, it } from 'vitest';

import type { AddonQuoteLine, BookingQuote, PackageQuoteLine } from '@/types/booking';

import { bookingQuoteHash } from './quote-hash';

// The same quotes and the same hex as supabase/tests/booking_quote.sql, so the summary's hash and
// internal.booking_quote_hash cannot drift apart (decision of 2026-10-22, Q6).

const PACKAGE_LINE: PackageQuoteLine = {
  kind: 'package',
  packageId: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Paket Uji',
  rwIds: [5],
  pricingBasis: 'per_pax',
  tier: { minPax: 21, maxPax: 60, pricePerPax: 25000 },
  unitPrice: 25000,
  quantity: 30,
  lineTotal: 750000,
};

function addon(productId: string, unitPrice: number, quantity: number): AddonQuoteLine {
  return {
    kind: 'addon',
    productId,
    rwId: 5,
    name: 'Produk Uji',
    unitLabel: 'buah',
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
  };
}

const COMPOST = addon('bbbbbbbb-0000-4000-8000-000000000002', 15000, 2);
const SEEDLING = addon('bbbbbbbb-0000-4000-8000-000000000001', 20000, 1);
const WITH_ADDONS: BookingQuote = { lines: [PACKAGE_LINE, COMPOST, SEEDLING], total: 800000 };

describe('bookingQuoteHash', () => {
  it('hashes a quote with add-ons to the hex the database computes', () => {
    expect(bookingQuoteHash(WITH_ADDONS)).toBe(
      '0f7e523b88cecafeceb9f1a3cfe4a75104b7fc26b81c5d01c07f827e02261e5e',
    );
  });

  it('and a package line alone', () => {
    const flat: PackageQuoteLine = {
      ...PACKAGE_LINE,
      packageId: 'aaaaaaaa-0000-4000-8000-000000000003',
      pricingBasis: 'flat_group',
      tier: null,
      unitPrice: 1000000,
      quantity: 1,
      lineTotal: 1000000,
    };
    expect(bookingQuoteHash({ lines: [flat], total: 1000000 })).toBe(
      'e40581641e2900b01230647883a867fc587086fe77371aa8636bafb351ad0523',
    );
  });

  it('does not depend on the order the visitor picked the add-ons in', () => {
    const reordered: BookingQuote = { lines: [PACKAGE_LINE, SEEDLING, COMPOST], total: 800000 };
    expect(bookingQuoteHash(reordered)).toBe(bookingQuoteHash(WITH_ADDONS));
  });

  it('changes with any price, quantity or total', () => {
    const dearer = addon(COMPOST.productId, 16000, 2);
    expect(bookingQuoteHash({ lines: [PACKAGE_LINE, dearer, SEEDLING], total: 804000 })).not.toBe(
      bookingQuoteHash(WITH_ADDONS),
    );
    expect(bookingQuoteHash({ ...WITH_ADDONS, total: 800001 })).not.toBe(
      bookingQuoteHash(WITH_ADDONS),
    );
  });

  it('leaves out what is not a price: names, labels and the tier a price came from', () => {
    const renamed: BookingQuote = {
      lines: [
        { ...PACKAGE_LINE, name: 'Nama Lain', tier: null },
        { ...COMPOST, name: 'Lain' },
        SEEDLING,
      ],
      total: 800000,
    };
    expect(bookingQuoteHash(renamed)).toBe(bookingQuoteHash(WITH_ADDONS));
  });
});
