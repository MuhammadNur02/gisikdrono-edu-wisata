import { z } from 'zod';

import {
  CANCEL_REASON_LIMITS,
  RESENDABLE_TEMPLATES,
  REVIEW_REASON_LIMITS,
  REVIEW_RESOLUTIONS,
  STAFF_CANCEL_CATEGORIES,
} from '@/config/bookings';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { copy } from '@/lib/copy/id';
import { totpCodeField } from '@/lib/validations/auth';
import { isSafeFreeText } from '@/lib/validations/free-text';

// The staff steps of /dashboard/bookings/[id] (Task P4.3.08; docs/PRD.md §13.1 A28), shared by the forms and
// src/server/actions/booking-staff.ts. The reasons land on the booking's timeline and the audit log, so they follow
// the free-text rules.

const FULL_PERCENT = 100;
const text = bookingStaffCopy.validation;
const bookingId = z.uuid();

function reasonField(limits: { min: number; max: number }) {
  return z
    .string()
    .trim()
    .min(limits.min, text.reason(limits.min))
    .max(limits.max)
    .refine(isSafeFreeText, { message: copy.validation.freeText });
}

export const cancelPreviewSchema = z
  .object({ bookingId, reasonCategory: z.enum(STAFF_CANCEL_CATEGORIES).nullable() })
  .strict();

// The refund the preview showed goes with the cancellation; the database answers PRICE_MISMATCH when it moved since.
export const cancelBookingSchema = z
  .object({
    bookingId,
    reason: reasonField(CANCEL_REASON_LIMITS),
    reasonCategory: z.enum(STAFF_CANCEL_CATEGORIES).nullable(),
    expectedAmount: z.int().nonnegative(),
    expectedPct: z.int().min(0).max(FULL_PERCENT).nullable(),
  })
  .strict();
export const cancelBookingFormSchema = cancelBookingSchema.extend({ code: totpCodeField });
export type CancelBookingValues = z.output<typeof cancelBookingSchema>;

export const extendHoldSchema = z
  .object({ bookingId, newExpiresAt: z.iso.datetime({ offset: true }) })
  .strict();
export type ExtendHoldValues = z.output<typeof extendHoldSchema>;

export const resendMessageSchema = z
  .object({
    bookingId,
    template: z.enum(RESENDABLE_TEMPLATES),
    channel: z.enum(['whatsapp', 'email']),
  })
  .strict();
export type ResendMessageValues = z.output<typeof resendMessageSchema>;

// A28: a move names one open session per leg, in leg order; a refund none.
export const resolveReviewSchema = z
  .object({
    bookingId,
    resolution: z.enum(REVIEW_RESOLUTIONS),
    reason: reasonField(REVIEW_REASON_LIMITS),
    sessionIds: z.array(z.uuid()),
  })
  .strict()
  .refine((review) => (review.resolution === 'move') === review.sessionIds.length > 0, {
    path: ['sessionIds'],
    message: text.sessions,
  });
export const resolveReviewFormSchema = z
  .object({
    bookingId,
    resolution: z.enum(REVIEW_RESOLUTIONS),
    reason: reasonField(REVIEW_REASON_LIMITS),
    // The pickers start empty; a refund ignores them.
    sessionIds: z.array(z.string()),
    code: totpCodeField,
  })
  .strict()
  .refine(
    (review) =>
      review.resolution === 'refund' ||
      (review.sessionIds.length > 0 &&
        review.sessionIds.every((sessionId) => z.uuid().safeParse(sessionId).success)),
    { path: ['sessionIds'], message: text.sessions },
  );
export type ResolveReviewValues = z.output<typeof resolveReviewSchema>;
