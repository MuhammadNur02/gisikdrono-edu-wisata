import type { PublicReview, RatingSummary } from '@/types/review';

// One decimal, Indonesian comma: 4,9 (docs/StyleGuide.md §9.2).
const ratingFormat = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const RATING_DECIMALS = 10;

// The trust row and AggregateRating (docs/StyleGuide.md §5.7) count published reviews only. None means no
// summary at all, never a zero rating.
export function summarizeRatings(
  reviews: readonly Pick<PublicReview, 'rating'>[],
): RatingSummary | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  const average = Math.round((total / reviews.length) * RATING_DECIMALS) / RATING_DECIMALS;
  return { averageRating: average, reviewCount: reviews.length };
}

export function formatRating(rating: number): string {
  return ratingFormat.format(rating);
}
