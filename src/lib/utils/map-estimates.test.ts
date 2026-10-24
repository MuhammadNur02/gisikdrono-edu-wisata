import { describe, expect, it } from 'vitest';

import {
  ESTIMATE_TOLERANCE_DEGREES,
  isSeededPointEstimate,
  isSeededRwCentreEstimate,
} from '@/lib/utils/map-estimates';

const BANK_SAMPAH = { rwId: 5, slug: 'bank-sampah-sumber-rejeki', lat: -6.992862, lng: 110.390212 };

describe('isSeededPointEstimate', () => {
  it('is true while the point holds the seeded estimate', () => {
    expect(isSeededPointEstimate(BANK_SAMPAH)).toBe(true);
  });

  it('tolerates the float noise of a numeric(9,6) read', () => {
    const noisy = ESTIMATE_TOLERANCE_DEGREES / 4;
    expect(isSeededPointEstimate({ ...BANK_SAMPAH, lat: BANK_SAMPAH.lat + noisy })).toBe(true);
  });

  it('is false once the kelurahan has moved the point', () => {
    const moved = 2 * ESTIMATE_TOLERANCE_DEGREES;
    expect(isSeededPointEstimate({ ...BANK_SAMPAH, lat: BANK_SAMPAH.lat + moved })).toBe(false);
    expect(isSeededPointEstimate({ ...BANK_SAMPAH, lng: BANK_SAMPAH.lng - moved })).toBe(false);
  });

  it('is false for a point without coordinates, of another RW, or never seeded', () => {
    expect(isSeededPointEstimate({ ...BANK_SAMPAH, lat: null })).toBe(false);
    expect(isSeededPointEstimate({ ...BANK_SAMPAH, rwId: 13 })).toBe(false);
    expect(isSeededPointEstimate({ ...BANK_SAMPAH, slug: 'titik-baru' })).toBe(false);
  });
});

describe('isSeededRwCentreEstimate', () => {
  it('is true for the seeded centre and false once it is changed or for an RW never seeded', () => {
    expect(isSeededRwCentreEstimate(5, { lat: -6.993112, lng: 110.389779 })).toBe(true);
    expect(isSeededRwCentreEstimate(5, { lat: -6.9931, lng: 110.389779 })).toBe(false);
    expect(isSeededRwCentreEstimate(7, { lat: -6.993112, lng: 110.389779 })).toBe(false);
    expect(isSeededRwCentreEstimate(5, { lat: null, lng: null })).toBe(false);
  });
});
