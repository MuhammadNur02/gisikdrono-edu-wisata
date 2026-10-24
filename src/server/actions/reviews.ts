'use server';

import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import { moderateReviewSchema, submitReviewSchema } from '@/lib/validations/review';
import { requireGuestToken, requireRole } from '@/server/auth/guards';
import { submitReview, withinGuestLimits } from '@/server/services/booking-service';
import { moderateReview } from '@/server/services/review-service';
import type { ActionResult } from '@/types/action-result';
import type { ReviewAdmin } from '@/types/review';

// /reservasi/[bookingCode]/ulasan (docs/PRD.md FR-POST-05, FR-POST-06; Task P4.11.02): the review of the booking whose
// review link this browser holds. A booking that has its review already answers CONFLICT from the database, which only
// a double submit reaches, since the link dies with the review (verifyGuestAccess); the visitor sees the thank-you then
// too. A new review is pending, so nothing public changes and nothing is revalidated.
export async function submitReviewAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'review');
  if (!guard.ok) return guard;
  const clientIp = clientIpFrom(await headers());

  try {
    const ip = rateLimitIpBucket(clientIp);
    if (!(await withinGuestLimits([{ name: 'review:submit', subject: ip }]))) {
      return fail('RATE_LIMITED');
    }
    const token = parsed.data.turnstileToken;
    if (!(await verifyTurnstile(token, clientIp, TURNSTILE_ACTIONS.reviewSubmit))) {
      const captchaFailed = copy.booking.otp.captchaFailed;
      return fail('VALIDATION', { turnstileToken: [captchaFailed] }, captchaFailed);
    }
    await submitReview(guard.guest.bookingId, parsed.data);
    return ok(null);
  } catch (error) {
    const failure = await mapError(error);
    return failure.error.code === 'CONFLICT' ? ok(null) : failure;
  }
}

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
