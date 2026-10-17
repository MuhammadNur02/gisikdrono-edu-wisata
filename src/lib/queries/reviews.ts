import 'server-only';

import { z } from 'zod';

import { isRwId } from '@/config/rw';
import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { PublicReview } from '@/types/review';

const REVIEW_COLUMNS =
  'id, rating, title, body, reviewer_name, institution_name, rw_ids, is_featured, created_at';

// Every column of a view is nullable to PostgREST, although v_public_reviews copies NOT NULL columns.
const reviewRowSchema = z.object({
  id: z.string(),
  rating: z.number().int(),
  title: z.string().nullable(),
  body: z.string(),
  reviewer_name: z.string(),
  institution_name: z.string().nullable(),
  rw_ids: z.array(z.number().int()),
  is_featured: z.boolean(),
  created_at: z.string(),
});

function toPublicReview(row: unknown): PublicReview {
  const review = reviewRowSchema.parse(row);
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    reviewerName: review.reviewer_name,
    institutionName: review.institution_name,
    rwIds: review.rw_ids.filter(isRwId),
    isFeatured: review.is_featured,
    createdAt: review.created_at,
  };
}

// Published reviews through v_public_reviews (first name or `Pengunjung` only), featured first, then newest.
export const listPublicReviews = cachedPublicRead(
  async (): Promise<PublicReview[]> => {
    const result = await createSupabaseAnonClient()
      .from('v_public_reviews')
      .select(REVIEW_COLUMNS)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });
    return rowsOf(result, 'v_public_reviews').map(toPublicReview);
  },
  ['reviews', 'list'],
  [TAGS.reviews],
);
