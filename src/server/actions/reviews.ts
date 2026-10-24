'use server';

import { revalidateTag } from 'next/cache';

import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { moderateReviewSchema } from '@/lib/validations/review';
import { requireRole } from '@/server/auth/guards';
import { moderateReview } from '@/server/services/review-service';
import type { ActionResult } from '@/types/action-result';
import type { ReviewAdmin } from '@/types/review';

// /dashboard/reviews (Task P4.3.07, docs/Security.md GUEST-05): the superadmin publishes, rejects or features a review
// and notes why; an RW admin only reads. RLS (reviews_super_moderate) refuses anyone else a second time. The
// dashboard runs at AAL2 only, and so does this decision about what the public reads.
export async function moderateReviewAction(input: unknown): Promise<ActionResult<ReviewAdmin>> {
  const parsed = moderateReviewSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    const review = await moderateReview(parsed.data);
    revalidateTag(TAGS.reviews);
    return ok(review);
  } catch (error) {
    return mapError(error);
  }
}
