import { describe, expect, it } from 'vitest';

import {
  computeBookingQuote,
  type BookingQuoteInput,
  type QuotedPackage,
  type QuotedProduct,
  type QuoteResult,
} from '@/lib/pricing/compute-booking-quote';
import type { BookingQuote } from '@/types/booking';

const ECOWASTREME: QuotedPackage = {
  id: 'pkg-ecowastreme',
  name: 'Eduwisata Ecowastreme',
  pricingBasis: 'per_pax',
  pricePerPax: 25000,
  flatPrice: null,
  minPax: 10,
  maxPax: 200,
};

const VOLUME_TIERS = [
  { minPax: 20, maxPax: 49, pricePerPax: 22500 },
  { minPax: 50, maxPax: null, pricePerPax: 20000 },
];

const KERIPIK: QuotedProduct = {
  id: 'prd-keripik',
  vendorId: 'vnd-pkk-rw05',
  rwId: 5,
  name: 'Keripik Daun Kelor',
  unitLabel: 'bungkus',
  price: 12000,
  minOrderQty: 10,
  maxOrderQty: 100,
};

const SELENDANG: QuotedProduct = {
  id: 'prd-selendang',
  vendorId: 'vnd-sanggar-rw08',
  rwId: 8,
  name: 'Selendang Batik Sanggar',
  unitLabel: 'helai',
  price: 85000,
  minOrderQty: 1,
  maxOrderQty: null,
};

const RW05_VISIT: BookingQuoteInput = {
  package: ECOWASTREME,
  legs: [{ rwId: 5 }],
  tiers: [],
  products: [KERIPIK, SELENDANG],
  pax: 30,
  addons: [],
};

function quoteOf(input: BookingQuoteInput): BookingQuote {
  const result = computeBookingQuote(input);
  if (!result.ok) throw new Error(`expected a quote, got ${result.problem}`);
  return result.quote;
}

function sumOf(quote: BookingQuote): number {
  return quote.lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

describe('computeBookingQuote: price per person', () => {
  it('multiplies the package price by the visitors when no tier applies', () => {
    const quote = quoteOf(RW05_VISIT);
    expect(quote.lines).toEqual([
      {
        kind: 'package',
        packageId: 'pkg-ecowastreme',
        name: 'Eduwisata Ecowastreme',
        rwIds: [5],
        pricingBasis: 'per_pax',
        tier: null,
        unitPrice: 25000,
        quantity: 30,
        lineTotal: 750000,
      },
    ]);
    expect(quote.total).toBe(750000);
  });

  it.each([
    [19, 25000, null, 475000],
    [20, 22500, VOLUME_TIERS[0], 450000],
    [49, 22500, VOLUME_TIERS[0], 1102500],
    [50, 20000, VOLUME_TIERS[1], 1000000],
    [200, 20000, VOLUME_TIERS[1], 4000000],
  ])('prices %i visitors at %i each across the tier boundaries', (pax, unitPrice, tier, total) => {
    const quote = quoteOf({ ...RW05_VISIT, tiers: VOLUME_TIERS, pax });
    expect(quote.lines[0]).toMatchObject({ unitPrice, tier, quantity: pax, lineTotal: total });
    expect(quote.total).toBe(total);
  });

  it('takes a tier price even when the package has no price per person of its own to fall back on', () => {
    const tiersOnly = { ...ECOWASTREME, pricePerPax: null };
    const quote = quoteOf({ ...RW05_VISIT, package: tiersOnly, tiers: VOLUME_TIERS, pax: 60 });
    expect(quote.total).toBe(1200000);
  });
});

describe('computeBookingQuote: flat group price', () => {
  const groupPackage: QuotedPackage = {
    ...ECOWASTREME,
    pricingBasis: 'flat_group',
    pricePerPax: null,
    flatPrice: 2500000,
  };

  it('charges one flat price for the whole group, whatever its size and the tiers', () => {
    for (const pax of [10, 35, 200]) {
      const quote = quoteOf({ ...RW05_VISIT, package: groupPackage, tiers: VOLUME_TIERS, pax });
      expect(quote.lines[0]).toMatchObject({
        pricingBasis: 'flat_group',
        tier: null,
        unitPrice: 2500000,
        quantity: 1,
        lineTotal: 2500000,
      });
      expect(quote.total).toBe(2500000);
    }
  });
});

describe('computeBookingQuote: combo legs and add-ons', () => {
  const combo: BookingQuoteInput = {
    package: {
      ...ECOWASTREME,
      id: 'pkg-combo',
      name: 'Paket Kombo Gisikdrono',
      pricePerPax: 45000,
    },
    legs: [{ rwId: 5 }, { rwId: 8 }],
    tiers: [],
    products: [KERIPIK, SELENDANG],
    pax: 40,
    addons: [
      { productId: 'prd-keripik', qty: 40 },
      { productId: 'prd-selendang', qty: 2 },
    ],
  };

  it('prices the package once for both RWs and adds one line per add-on', () => {
    const quote = quoteOf(combo);
    expect(quote.lines).toEqual([
      expect.objectContaining({ kind: 'package', rwIds: [5, 8], lineTotal: 1800000 }),
      {
        kind: 'addon',
        productId: 'prd-keripik',
        vendorId: 'vnd-pkk-rw05',
        rwId: 5,
        name: 'Keripik Daun Kelor',
        unitLabel: 'bungkus',
        unitPrice: 12000,
        quantity: 40,
        lineTotal: 480000,
      },
      expect.objectContaining({ kind: 'addon', rwId: 8, unitPrice: 85000, lineTotal: 170000 }),
    ]);
    expect(quote.total).toBe(2450000);
  });

  it('keeps total equal to the sum of the lines in every case above', () => {
    const quotes = [
      quoteOf(combo),
      quoteOf(RW05_VISIT),
      quoteOf({ ...RW05_VISIT, tiers: VOLUME_TIERS }),
    ];
    for (const quote of quotes) {
      expect(quote.total).toBe(sumOf(quote));
      expect(quote.total).toBeGreaterThan(0);
    }
  });

  it('refuses a product from an RW the package does not visit', () => {
    const result = computeBookingQuote({
      ...RW05_VISIT,
      addons: [{ productId: 'prd-selendang', qty: 1 }],
    });
    expect(result).toEqual({ ok: false, problem: 'addon_unavailable', productId: 'prd-selendang' });
  });

  it('refuses a product that is not on sale as an add-on', () => {
    const result = computeBookingQuote({ ...combo, products: [KERIPIK] });
    expect(result).toEqual({ ok: false, problem: 'addon_unavailable', productId: 'prd-selendang' });
  });

  const keripikOrder = (qty: number) => ({ ...combo, addons: [{ productId: 'prd-keripik', qty }] });

  it.each([10, 100])('takes %i packs of a product sold 10 to 100 at a time', (qty) => {
    expect(computeBookingQuote(keripikOrder(qty)).ok).toBe(true);
  });

  it.each([9, 101])('refuses %i packs of a product sold 10 to 100 at a time', (qty) => {
    const refusal: QuoteResult = {
      ok: false,
      problem: 'addon_quantity_out_of_range',
      productId: 'prd-keripik',
    };
    expect(computeBookingQuote(keripikOrder(qty))).toEqual(refusal);
  });

  it('takes any quantity from the minimum up when the vendor sets no maximum', () => {
    const many = quoteOf({ ...combo, addons: [{ productId: 'prd-selendang', qty: 500 }] });
    expect(many.lines[1]?.lineTotal).toBe(42500000);
  });
});

describe('computeBookingQuote: group size', () => {
  it.each([9, 201])('refuses %i visitors for a package of 10 to 200', (pax) => {
    expect(computeBookingQuote({ ...RW05_VISIT, pax })).toEqual({
      ok: false,
      problem: 'pax_out_of_range',
    });
  });
});

describe('computeBookingQuote: broken money', () => {
  it.each([
    ['a fraction of a rupiah', 25000.5],
    ['a negative price', -1],
    ['a price too large to add up exactly', Number.MAX_SAFE_INTEGER + 1],
    ['not a number', Number.NaN],
  ])('throws on %s', (_case, pricePerPax) => {
    const input = { ...RW05_VISIT, package: { ...ECOWASTREME, pricePerPax } };
    expect(() => computeBookingQuote(input)).toThrow(RangeError);
  });

  it('throws when a line grows past what a number holds exactly', () => {
    const costly = { ...SELENDANG, price: Number.MAX_SAFE_INTEGER };
    const input = { ...RW05_VISIT, legs: [{ rwId: 8 as const }], products: [costly] };
    expect(() =>
      computeBookingQuote({ ...input, addons: [{ productId: 'prd-selendang', qty: 2 }] }),
    ).toThrow(RangeError);
  });

  it('throws on a free booking, which bookings_total_ok refuses', () => {
    const free = { ...RW05_VISIT, package: { ...ECOWASTREME, pricePerPax: 0 } };
    expect(() => computeBookingQuote(free)).toThrow(RangeError);
  });

  it('throws when the row lacks the price its basis needs', () => {
    const noPerPax = { ...ECOWASTREME, pricePerPax: null };
    const noFlat = { ...ECOWASTREME, pricingBasis: 'flat_group' as const, flatPrice: null };
    expect(() => computeBookingQuote({ ...RW05_VISIT, package: noPerPax })).toThrow(Error);
    expect(() => computeBookingQuote({ ...RW05_VISIT, package: noFlat })).toThrow(Error);
  });
});
