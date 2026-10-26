import { z } from 'zod';

import { walkInCopy } from '@/lib/copy/walk-in';
import { totpCodeField } from '@/lib/validations/auth';
import { rowIdSchema } from '@/lib/validations/content';

// The officer's booking at the counter (Task P4.3.10), the reads and the cash step around createAdminBookingSchema
// (src/lib/validations/booking.ts), shared by the form and src/server/actions/walk-in.ts.

const RECEIPT_REFERENCE_MAX_LENGTH = 100;

export const walkInPackageSchema = z.object({ packageId: rowIdSchema }).strict();

export const walkInQuoteSchema = z
  .object({ packageId: rowIdSchema, pax: z.int().positive() })
  .strict();

// The amount the officer took, which mark_booking_paid_manually compares with the booking's total.
export const recordCashSchema = z
  .object({
    bookingId: z.uuid(),
    amount: z.int().positive(),
    reference: z.string().trim().max(RECEIPT_REFERENCE_MAX_LENGTH, walkInCopy.validation.reference),
  })
  .strict();
export type RecordCashValues = z.output<typeof recordCashSchema>;

// The cash form also carries the authenticator code, which withStepUp sends to verifyStaffTotpAction first.
export const recordCashFormSchema = recordCashSchema.extend({ code: totpCodeField });
