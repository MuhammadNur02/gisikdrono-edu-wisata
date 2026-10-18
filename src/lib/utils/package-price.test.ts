import { describe, expect, it } from 'vitest';

import { describePackagePrice } from '@/lib/utils/package-price';

describe('describePackagePrice', () => {
  it('shows the price per visitor', () => {
    expect(
      describePackagePrice({
        pricingBasis: 'per_pax',
        pricePerPax: 35000,
        flatPrice: null,
        lowestTierPrice: null,
      }),
    ).toEqual({ isFromPrice: false, amount: 35000, basis: 'orang' });
  });

  it('shows the group price for a flat-group package', () => {
    expect(
      describePackagePrice({
        pricingBasis: 'flat_group',
        pricePerPax: null,
        flatPrice: 1500000,
        lowestTierPrice: null,
      }),
    ).toEqual({ isFromPrice: false, amount: 1500000, basis: 'rombongan' });
  });

  it('starts from the cheapest tier when volume tiers exist', () => {
    expect(
      describePackagePrice({
        pricingBasis: 'per_pax',
        pricePerPax: 35000,
        flatPrice: null,
        lowestTierPrice: 30000,
      }),
    ).toEqual({ isFromPrice: true, amount: 30000, basis: 'orang' });
  });

  it('shows nothing for a row without the price its basis needs', () => {
    expect(
      describePackagePrice({
        pricingBasis: 'flat_group',
        pricePerPax: 35000,
        flatPrice: null,
        lowestTierPrice: null,
      }),
    ).toBeNull();
  });
});
