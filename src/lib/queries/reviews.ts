import 'server-only';

import { z } from 'zod';

import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { listRwUnits } from '@/lib/queries/rw-units';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { PublicReview } from '@/types/review';
import type { RwBadge } from '@/types/rw-unit';

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

function toPublicReview(row: unknown, units: readonly RwBadge[]): PublicReview {
  const review = reviewRowSchema.parse(row);
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    reviewerName: review.reviewer_name,
    institutionName: review.institution_name,
    rws: review.rw_ids.map((rwId) => rwBadgeFor(rwId, units)),
    isFeatured: review.is_featured,
    createdAt: review.created_at,
  };
}

// Published reviews through v_public_reviews (first name or `Pengunjung` only), featured first, then newest.
export const listPublicReviews = cachedPublicRead(
  async (): Promise<PublicReview[]> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('v_public_reviews')
        .select(REVIEW_COLUMNS)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false }),
      listRwUnits(),
    ]);
    return rowsOf(result, 'v_public_reviews').map((row) => toPublicReview(row, units));
  },
  ['reviews', 'list'],
  [TAGS.reviews, TAGS.rwUnits],
);
