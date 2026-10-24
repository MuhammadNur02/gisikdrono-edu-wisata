import { describe, expect, it } from 'vitest';

import { isSameAmount } from '@/lib/midtrans/amount';

describe('isSameAmount', () => {
  it('reads Midtrans amounts with or without their decimals', () => {
    expect(isSameAmount('600000.00', 'IDR', 600000)).toBe(true);
    expect(isSameAmount('600000.0', 'IDR', 600000)).toBe(true);
    expect(isSameAmount('600000', 'IDR', 600000)).toBe(true);
  });

  it('matches nothing with cents, another number, another currency or another shape', () => {
    expect(isSameAmount('600000.50', 'IDR', 600000)).toBe(false);
    expect(isSameAmount('600001.00', 'IDR', 600000)).toBe(false);
    expect(isSameAmount('600000.00', 'USD', 600000)).toBe(false);
    expect(isSameAmount('6e5', 'IDR', 600000)).toBe(false);
    expect(isSameAmount('-600000.00', 'IDR', -600000)).toBe(false);
  });
});
