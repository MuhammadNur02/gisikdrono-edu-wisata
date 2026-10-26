import { describe, expect, it } from 'vitest';

import { packagesCopy } from '@/lib/copy/packages';

import { createPackageSchema, updatePackageSchema } from './package';

const TIER_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

const VALID = {
  name: 'Jelajah Ecowastreme',
  slug: 'jelajah-ecowastreme',
  category: 'regular',
  tagline: '',
  descriptionMd: '',
  highlights: ['Bank Sampah', '', '  Maggot  '],
  inclusions: [],
  itinerary: [{ rwId: 5, time: '08:00:00', title: 'Sambutan', description: '' }],
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
  validFrom: '',
  validTo: null,
  priceTiers: [],
  legRwIds: [],
};

function pathsOf(input: unknown): string[] {
  const result = createPackageSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('createPackageSchema', () => {
  it('drops blank lines, trims the rest, reads an empty date as none and parses its own output again', () => {
    const once = createPackageSchema.parse(VALID);
    expect(once).toMatchObject({
      highlights: ['Bank Sampah', 'Maggot'],
      validFrom: null,
      tagline: null,
      itinerary: [{ rwId: 5, time: '08:00', title: 'Sambutan', description: null }],
    });
    expect(createPackageSchema.parse(once)).toEqual(once);
  });

  it('asks for the price the basis names', () => {
    expect(pathsOf({ ...VALID, pricePerPax: null })).toEqual(['pricePerPax']);
    expect(pathsOf({ ...VALID, pricingBasis: 'flat_group' })).toEqual(['flatPrice']);
  });

  it('puts a maximum below the minimum and an end before the start under their own fields', () => {
    expect(pathsOf({ ...VALID, maxPax: 5 })).toEqual(['maxPax']);
    expect(pathsOf({ ...VALID, validFrom: '2026-12-01', validTo: '2026-11-01' })).toEqual([
      'validTo',
    ]);
  });

  it('refuses overlapping tiers and a tier that ends before it starts', () => {
    const overlapping = [
      { id: null, minPax: 20, maxPax: 40, pricePerPax: 22_000 },
      { id: TIER_ID, minPax: 40, maxPax: null, pricePerPax: 20_000 },
    ];
    expect(pathsOf({ ...VALID, priceTiers: overlapping })).toEqual(['priceTiers']);
    const reversed = [{ id: null, minPax: 40, maxPax: 20, pricePerPax: 20_000 }];
    expect(pathsOf({ ...VALID, priceTiers: reversed })).toEqual(['priceTiers.0.maxPax']);
  });

  it('takes a combo’s route in order, each RW once, and none for an RW package', () => {
    expect(pathsOf({ ...VALID, category: 'combo', legRwIds: [13, 5] })).toEqual([]);
    expect(pathsOf({ ...VALID, category: 'combo', legRwIds: [5, 5] })).toEqual(['legRwIds']);
    expect(pathsOf({ ...VALID, legRwIds: [5] })).toEqual(['legRwIds']);
    expect(createPackageSchema.safeParse({ ...VALID, category: 'combo', legs: [] }).success).toBe(
      false,
    );
  });

  it('publishes a combo only once its route visits two RWs (combo_legs_on_sale)', () => {
    const published = { ...VALID, category: 'combo', status: 'published' };
    expect(pathsOf({ ...published, legRwIds: [5] })).toEqual(['legRwIds']);
    expect(pathsOf({ ...published, legRwIds: [5, 13] })).toEqual([]);
    expect(pathsOf({ ...published, status: 'draft', legRwIds: [5] })).toEqual([]);
  });

  // Review of PR #79, L-1 and L-7: a combo keeps one RW at least, and visits four at most (MAX_PACKAGE_LEGS).
  it('keeps a combo route between one RW and four', () => {
    const combo = { ...VALID, category: 'combo' };
    const empty = createPackageSchema.safeParse({ ...combo, legRwIds: [] });
    expect(empty.success ? [] : empty.error.issues.map((issue) => issue.message)).toEqual([
      packagesCopy.validation.legsEmpty,
    ]);
    expect(pathsOf({ ...combo, legRwIds: [5, 8, 13, 1] })).toEqual([]);
    expect(pathsOf({ ...combo, legRwIds: [5, 8, 13, 1, 2] })).toEqual(['legRwIds']);
  });

  it('takes no owner RW, creator or id for a new package, and no fractional rupiah', () => {
    for (const extra of [{ rwId: 5 }, { createdBy: 'user-1' }, { id: TIER_ID }]) {
      expect(createPackageSchema.safeParse({ ...VALID, ...extra }).success).toBe(false);
    }
    expect(createPackageSchema.safeParse({ ...VALID, pricePerPax: 25_000.5 }).success).toBe(false);
  });

  it('caps the lines of a list after the blank ones are gone', () => {
    const lines = Array.from({ length: 21 }, (_, index) => `Kegiatan ${String(index)}`);
    expect(pathsOf({ ...VALID, highlights: lines })).toEqual(['highlights']);
    expect(pathsOf({ ...VALID, highlights: [...lines.slice(0, 20), '', ' '] })).toEqual([]);
  });
});

describe('updatePackageSchema', () => {
  it('needs the row id', () => {
    expect(updatePackageSchema.safeParse(VALID).success).toBe(false);
    expect(updatePackageSchema.safeParse({ ...VALID, id: TIER_ID }).success).toBe(true);
  });
});
