import { describe, expect, it } from 'vitest';

import { productPriceOf, shownPriceAmount } from './product-price';

describe('productPriceOf', () => {
  it('hides every price while the switch is off, a set one included', () => {
    expect(productPriceOf(15000, false)).toEqual({ status: 'hidden' });
    expect(productPriceOf(null, false)).toEqual({ status: 'hidden' });
  });

  it('shows the price once the switch is on', () => {
    expect(productPriceOf(15000, true)).toEqual({ status: 'set', amount: 15000 });
  });

  it('reads a product without a price as not set yet, never as 0', () => {
    expect(productPriceOf(null, true)).toEqual({ status: 'unset' });
  });
});

describe('shownPriceAmount', () => {
  it('names an amount only when one is shown', () => {
    expect(shownPriceAmount({ status: 'set', amount: 15000 })).toBe(15000);
    expect(shownPriceAmount({ status: 'unset' })).toBeNull();
    expect(shownPriceAmount({ status: 'hidden' })).toBeNull();
  });
});
