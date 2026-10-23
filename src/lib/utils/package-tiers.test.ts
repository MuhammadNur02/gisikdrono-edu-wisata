import { describe, expect, it } from 'vitest';

import { comboMayPublish, planTierWrites, tiersOverlap, type StoredTier } from './package-tiers';

const STORED: StoredTier[] = [
  { id: 'small', minPax: 1, maxPax: 19, pricePerPax: 25_000 },
  { id: 'large', minPax: 20, maxPax: null, pricePerPax: 20_000 },
];

describe('tiersOverlap', () => {
  it('lets tiers touch end to start without sharing a size, and an open tier swallows the next', () => {
    expect(tiersOverlap(STORED)).toBe(false);
    expect(
      tiersOverlap([
        { minPax: 50, maxPax: 60 },
        { minPax: 1, maxPax: null },
      ]),
    ).toBe(true);
    expect(
      tiersOverlap([
        { minPax: 1, maxPax: 20 },
        { minPax: 20, maxPax: 30 },
      ]),
    ).toBe(true);
    expect(tiersOverlap([])).toBe(false);
  });
});

describe('planTierWrites', () => {
  it('deletes the tiers the form dropped and inserts the new ones', () => {
    const plan = planTierWrites(STORED, [
      { id: 'small', minPax: 1, maxPax: 19, pricePerPax: 25_000 },
      { id: null, minPax: 20, maxPax: 49, pricePerPax: 22_000 },
    ]);
    expect(plan.deletes).toEqual(['large']);
    expect(plan.inserts).toHaveLength(1);
  });

  // Moving the boundary from 20 to 30: the large tier narrows first, so the small one can widen into 20–29.
  it('narrows before it widens, so the boundary moves without an overlap mid-way', () => {
    const plan = planTierWrites(STORED, [
      { id: 'small', minPax: 1, maxPax: 29, pricePerPax: 25_000 },
      { id: 'large', minPax: 30, maxPax: null, pricePerPax: 20_000 },
    ]);
    expect(plan.shrinks.map((tier) => tier.id)).toEqual(['large']);
    expect(plan.grows.map((tier) => tier.id)).toEqual(['small']);
  });

  it('counts a repriced tier with the same range as a shrink, which takes no sizes', () => {
    const plan = planTierWrites(STORED, [
      { id: 'small', minPax: 1, maxPax: 19, pricePerPax: 27_000 },
      { id: 'large', minPax: 20, maxPax: null, pricePerPax: 20_000 },
    ]);
    expect(plan.shrinks).toHaveLength(2);
    expect(plan).toMatchObject({ deletes: [], grows: [], inserts: [] });
  });

  it('drops a tier id the package does not have', () => {
    const plan = planTierWrites(STORED, [
      { id: 'foreign', minPax: 1, maxPax: 5, pricePerPax: 1 },
      ...STORED,
    ]);
    expect([...plan.shrinks, ...plan.grows].map((tier) => tier.id)).toEqual(['small', 'large']);
  });
});

describe('comboMayPublish', () => {
  it('wants two different RWs', () => {
    expect(comboMayPublish([])).toBe(false);
    expect(comboMayPublish([5, 5])).toBe(false);
    expect(comboMayPublish([5, 8])).toBe(true);
  });
});
