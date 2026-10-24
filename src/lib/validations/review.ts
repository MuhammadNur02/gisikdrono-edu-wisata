import { z } from 'zod';

import { MAX_RATING, REVIEW_LIMITS } from '@/config/reviews';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { reviewsCopy } from '@/lib/copy/reviews';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';
import { captchaTokenField } from '@/lib/validations/auth';
import { isSafeFreeText, optionalFreeTextSchema } from '@/lib/validations/free-text';

// The review forms (Task P4.3.07, P4.11.02), shared by the browser and the Server Actions. Each schema parses its own
// output again unchanged, since a form hands its action what the resolver already parsed. The lengths repeat the
// CHECKs of public.reviews (0003_tables.sql).

const formText = reviewsCopy.form.validation;
const moderationText = reviewsCopy.moderation.validation;

// A review is published under the visitor's first name, and its text on /ulasan: no link, address, email or phone
// number in either (docs/Security.md GUEST-05, the same rule as every visitor's free text, GUEST-07).
const reviewBodyField = z
  .string()
  .trim()
  .min(REVIEW_LIMITS.bodyMin, formText.bodyTooShort)
  .max(REVIEW_LIMITS.bodyMax, formText.bodyTooLong)
  .refine(isSafeFreeText, copy.validation.freeText);

const reviewerNameField = z
  .string()
  .trim()
  .min(REVIEW_LIMITS.reviewerNameMin, formText.nameTooShort)
  .max(REVIEW_LIMITS.reviewerNameMax, formText.nameTooLong)
  .refine(isSafeFreeText, copy.validation.freeText);

// docs/PRD.md FR-POST-06: rating 1–5, an optional title, the body, a display name and the anonymous option. The
// booking comes from the signed review link the action checks (requireGuestToken), never from this code alone.
export const submitReviewSchema = z
  .object({
    bookingCode: z.string().regex(BOOKING_CODE_PATTERN),
    rating: z.number().int().min(1, formText.rating).max(MAX_RATING, formText.rating),
    title: optionalFreeTextSchema(REVIEW_LIMITS.title, { tooLong: formText.titleTooLong }),
    body: reviewBodyField,
    reviewerName: reviewerNameField,
    isAnonymous: z.boolean(),
    turnstileToken: captchaTokenField,
  })
  .strict();

export type SubmitReviewInput = z.input<typeof submitReviewSchema>;
export type SubmitReviewValues = z.output<typeof submitReviewSchema>;

// The three columns 0005 grants authenticated for update on public.reviews; reviews_super_moderate lets only the
// superadmin through, and reviews_moderation_stamp records who and when.
export const moderateReviewSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(DB_ENUMS.review_status),
    isFeatured: z.boolean(),
    moderationNote: z
      .string()
      .trim()
      .max(REVIEW_LIMITS.moderationNote, moderationText.noteTooLong)
      .nullish()
      .transform((note) => (note === undefined || note === null || note === '' ? null : note)),
  })
  .strict()
  // The home band shows featured rows of v_public_reviews, so a featured review that is not published would sit
  // there unseen and appear the day someone publishes it by mistake.
  .refine((review) => !review.isFeatured || review.status === 'published', {
    path: ['isFeatured'],
    message: moderationText.featuredNeedsPublished,
  });

export type ModerateReviewInput = z.input<typeof moderateReviewSchema>;
export type ModerateReviewValues = z.output<typeof moderateReviewSchema>;
