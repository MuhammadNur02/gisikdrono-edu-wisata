import { describe, expect, it } from 'vitest';

import { comboMayPublish, tiersOverlap } from './package-tiers';

const STORED = [
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

describe('comboMayPublish', () => {
  it('wants two different RWs', () => {
    expect(comboMayPublish([])).toBe(false);
    expect(comboMayPublish([5, 5])).toBe(false);
    expect(comboMayPublish([5, 8])).toBe(true);
  });
});
