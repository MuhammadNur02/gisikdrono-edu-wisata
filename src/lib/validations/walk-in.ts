import { z } from 'zod';

import { walkInCopy } from '@/lib/copy/walk-in';
import { totpCodeField } from '@/lib/validations/auth';
import { rowIdSchema } from '@/lib/validations/content';

// The officer's booking at the counter (Task P4.3.10), the reads and the cash step around createAdminBookingSchema
// (src/lib/validations/booking.ts), shared by the forms and src/server/actions/walk-in.ts and walk-in-cash.ts.

const RECEIPT_REFERENCE_MAX_LENGTH = 100;

export const walkInPackageSchema = z.object({ packageId: rowIdSchema }).strict();

export const walkInQuoteSchema = z
  .object({ packageId: rowIdSchema, pax: z.int().positive() })
  .strict();

// The amount the officer took, which mark_booking_paid_manually compares with the booking's total, and after the
// session started the people counted in (A23 addendum; the database checks that the two go together).
export const recordCashSchema = z
  .object({
    bookingId: z.uuid(),
    amount: z.int().positive(),
    reference: z.string().trim().max(RECEIPT_REFERENCE_MAX_LENGTH, walkInCopy.validation.reference),
    attendeeCount: z.int().positive().nullable(),
  })
  .strict();
export type RecordCashValues = z.output<typeof recordCashSchema>;

// The cash form also carries the authenticator code, which withStepUp sends to verifyStaffTotpAction first, and once the
// session has started the officer's "Rombongan sudah hadir" with the count. The tick never leaves the form (the form
// drops it before the action, whose schema is strict).
export const CASH_PRESENT_FIELD = 'isPresent';

export function recordCashFormSchema(hasSessionStarted: boolean, maxAttendees: number) {
  return recordCashSchema
    .extend({
      code: totpCodeField,
      isPresent: z.boolean(),
      attendeeCount: z.int().min(1).max(maxAttendees, walkInCopy.validation.attendees).nullable(),
    })
    .superRefine((cash, context) => {
      if (!hasSessionStarted) return;
      if (!cash.isPresent) {
        context.addIssue({
          code: 'custom',
          path: ['isPresent'],
          message: walkInCopy.validation.present,
        });
      }
      if (cash.attendeeCount === null) {
        context.addIssue({
          code: 'custom',
          path: ['attendeeCount'],
          message: walkInCopy.validation.attendees,
        });
      }
    });
}
