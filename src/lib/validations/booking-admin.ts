import { z } from 'zod';

import {
  ADMIN_NOTES_MAX_LENGTH,
  REVEAL_REASON_LIMITS,
  STAFF_FULFILLMENT_STATUSES,
} from '@/config/bookings';
import { copy } from '@/lib/copy/id';
import { TICKET_CODE_PATTERN } from '@/lib/utils/codes';
import { totpCodeField } from '@/lib/validations/auth';
import { isSafeFreeText } from '@/lib/validations/free-text';

// /dashboard/bookings/[id] (Task P4.3.02), shared by the forms and src/server/actions/booking-admin.ts. The reveal
// reason lands in security_events and the staff note on the booking, which other staff read later, so both follow the
// free-text rules: no phone numbers, addresses or links.

const messages = copy.cms.validation;

const bookingId = z.uuid();

export const bookingTargetSchema = z.object({ bookingId }).strict();

// A reveal's or a revocation's reason: 3 to 300 characters, as both functions check.
const reasonField = z
  .string()
  .trim()
  .min(REVEAL_REASON_LIMITS.min, messages.required)
  .max(REVEAL_REASON_LIMITS.max)
  .refine(isSafeFreeText, { message: copy.validation.freeText });

export const revealContactSchema = z.object({ bookingId, reason: reasonField }).strict();

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

// The superadmin revokes one ticket of the booking, by its code, with the reason the ticket keeps (revoke_ticket).
export const revokeTicketSchema = z
  .object({
    bookingId,
    ticketCode: z.string().regex(TICKET_CODE_PATTERN),
    reason: reasonField,
  })
  .strict();

// The dialog's form: the same fields and the authenticator code, which withStepUp sends to verifyStaffTotpAction first
// (docs/Security.md §5.3; review of PR #76, F-76-2).
export const revokeTicketFormSchema = revokeTicketSchema.extend({ code: totpCodeField });

export type RevealContactInput = z.input<typeof revealContactSchema>;
export type RevealContactValues = z.output<typeof revealContactSchema>;
export type AdminNotesInput = z.input<typeof adminNotesSchema>;
export type AdminNotesValues = z.output<typeof adminNotesSchema>;
export type RevokeTicketInput = z.input<typeof revokeTicketSchema>;
export type RevokeTicketValues = z.output<typeof revokeTicketSchema>;
export type AddonFulfillmentValues = z.output<typeof addonFulfillmentSchema>;
