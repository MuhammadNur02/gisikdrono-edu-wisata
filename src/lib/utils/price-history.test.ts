import { describe, expect, it } from 'vitest';

import type { PriceHistoryEntry } from '@/types/package';

import { describePriceChange } from './price-history';

const ENTRY: PriceHistoryEntry = {
  id: 1,
  changedAt: '2026-10-24T01:00:00Z',
  tierId: null,
  oldPricePerPax: null,
  newPricePerPax: null,
  oldFlatPrice: null,
  newFlatPrice: null,
};

// Intl writes a non-breaking space after `Rp`.
const rp = (digits: string) => `Rp ${digits}`;

describe('describePriceChange', () => {
  it('names a per-person price change from the old price to the new one', () => {
    expect(
      describePriceChange({ ...ENTRY, oldPricePerPax: 25_000, newPricePerPax: 30_000 }),
    ).toEqual([`Harga per orang ${rp('25.000')} → ${rp('30.000')}`]);
  });

  it('names the tier when a tier was repriced, and a dash for a price that was not there', () => {
    expect(
      describePriceChange({
        ...ENTRY,
        tierId: 'tier-1',
        oldPricePerPax: null,
        newPricePerPax: 20_000,
      }),
    ).toEqual([`Tingkat harga rombongan: Harga per orang — → ${rp('20.000')}`]);
  });

  it('lists both prices when both moved, and says so when neither did', () => {
    expect(
      describePriceChange({
        ...ENTRY,
        oldPricePerPax: 25_000,
        newPricePerPax: null,
        oldFlatPrice: null,
        newFlatPrice: 500_000,
      }),
    ).toHaveLength(2);
    expect(describePriceChange(ENTRY)).toEqual(['Dasar harga atau jumlah rombongan berubah']);
  });
});
