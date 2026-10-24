// Reviews (docs/PRD.md FR-POST-06, FR-ADMIN-19; Task P4.3.07, P4.11.02). The lengths are the CHECKs of
// public.reviews in supabase/migrations/0003_tables.sql; moderation_note has none there, so this cap is the app's.

export const REVIEW_LIMITS = {
  title: 120,
  bodyMin: 10,
  bodyMax: 2000,
  reviewerNameMin: 2,
  reviewerNameMax: 60,
  moderationNote: 500,
} as const;

// reviews.rating is a 1–5 score (check rating between 1 and 5).
export const MAX_RATING = 5;
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

export const REVIEWS_DASHBOARD_PATH = '/dashboard/reviews';

// The columns the list may be ordered by, through `?sort=`; anything else in the URL is ignored.
export const REVIEW_SORT_COLUMNS = ['created_at', 'rating'] as const;
export const REVIEW_DEFAULT_SORT = 'created_at.desc';
