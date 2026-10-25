import { z } from 'zod';

import {
  ADMIN_NOTES_MAX_LENGTH,
  REVEAL_REASON_LIMITS,
  STAFF_FULFILLMENT_STATUSES,
} from '@/config/bookings';
import { copy } from '@/lib/copy/id';
import { isSafeFreeText } from '@/lib/validations/free-text';

// /dashboard/bookings/[id] (Task P4.3.02), shared by the forms and src/server/actions/booking-admin.ts. The reveal
// reason lands in security_events and the staff note on the booking, which other staff read later, so both follow the
// free-text rules: no phone numbers, addresses or links.

const messages = copy.cms.validation;

const bookingId = z.uuid();

export const bookingTargetSchema = z.object({ bookingId }).strict();

export const revealContactSchema = z
  .object({
    bookingId,
    reason: z
      .string()
      .trim()
      .min(REVEAL_REASON_LIMITS.min, messages.required)
      .max(REVEAL_REASON_LIMITS.max)
      .refine(isSafeFreeText, { message: copy.validation.freeText }),
  })
  .strict();

// An empty note clears it (booking-admin-service.ts stores it as null).
export const adminNotesSchema = z
  .object({
    bookingId,
    adminNotes: z
      .string()
      .trim()
      .max(ADMIN_NOTES_MAX_LENGTH)
      .refine(isSafeFreeText, { message: copy.validation.freeText }),
  })
  .strict();

export const addonFulfillmentSchema = z
  .object({ bookingId, addonId: z.uuid(), status: z.enum(STAFF_FULFILLMENT_STATUSES) })
  .strict();

export type RevealContactInput = z.input<typeof revealContactSchema>;
export type RevealContactValues = z.output<typeof revealContactSchema>;
export type AdminNotesInput = z.input<typeof adminNotesSchema>;
export type AdminNotesValues = z.output<typeof adminNotesSchema>;
export type AddonFulfillmentValues = z.output<typeof addonFulfillmentSchema>;
