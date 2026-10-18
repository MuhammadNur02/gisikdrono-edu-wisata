import { describe, expect, it } from 'vitest';

import { formatRating, summarizeRatings } from '@/lib/utils/ratings';

describe('summarizeRatings', () => {
  it('gives no summary without published reviews, never a zero rating', () => {
    expect(summarizeRatings([])).toBeNull();
  });

  it('averages to one decimal and counts the reviews', () => {
    expect(summarizeRatings([{ rating: 5 }, { rating: 5 }, { rating: 4 }])).toEqual({
      averageRating: 4.7,
      reviewCount: 3,
    });
  });
});

describe('formatRating', () => {
  it('writes one decimal with an Indonesian comma', () => {
    expect(formatRating(4.9)).toBe('4,9');
    expect(formatRating(5)).toBe('5,0');
  });
});
