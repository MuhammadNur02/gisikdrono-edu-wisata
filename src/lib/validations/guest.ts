import { z } from 'zod';

import { MAX_PACKAGE_LEGS } from '@/config/booking';
import { OTP_CODE_LENGTH } from '@/config/guest';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { BOOKING_CODE_PATTERN, normalizeBookingCode } from '@/lib/utils/codes';
import { normalizePhone } from '@/lib/utils/phone';
import { captchaTokenField, emailField } from '@/lib/validations/auth';
import { picPhoneSchema } from '@/lib/validations/booking';

// The visitor's identity forms (Task P3.2.03, P3.3.03), shared by the forms and their Server Actions. Each schema
// parses its own output again unchanged, since the form hands the action what its resolver already parsed.

const otpText = copy.booking.otp;
const lookupText = copy.booking.lookup;
const OTP_CODE_PATTERN = new RegExp(`^\\d{${String(OTP_CODE_LENGTH)}}$`);
const LOOKUP_FIELD_MAX_LENGTH = 254;

// channel email is the fallback while WhatsApp is limited: the code goes to the address, and the phone is only what
// the visitor typed (src/lib/links/phone-proof.ts). Asking for a code and checking it name the same contact, since
// the database finds the code by it and by the browser (no OTP id reaches the browser).
const otpContactFields = {
  channel: z.enum(['whatsapp', 'email']).default('whatsapp'),
  phone: picPhoneSchema,
  email: emailField.nullish().transform((email) => email ?? null),
};

function requireAddressForEmail(
  contact: { channel: 'whatsapp' | 'email'; email: string | null },
  context: z.RefinementCtx,
) {
  if (contact.channel === 'email' && contact.email === null) {
    context.addIssue({ code: 'custom', path: ['email'], message: copy.auth.validation.email });
  }
}

export const requestPhoneOtpSchema = z
  .object({ ...otpContactFields, turnstileToken: captchaTokenField })
  .strict()
  .superRefine(requireAddressForEmail);

export const verifyPhoneOtpSchema = z
  .object({
    ...otpContactFields,
    code: z.string().trim().regex(OTP_CODE_PATTERN, otpText.codeFormat),
  })
  .strict()
  .superRefine(requireAddressForEmail);

// What the visitor typed as their contact, in the one spelling the database compares: an E.164 number or a
// lower-cased address.
function canonicalContact(value: string): string | null {
  if (value.includes('@')) return emailField.safeParse(value).data ?? null;
  return normalizePhone(value);
}

export const lookupBookingSchema = z
  .object({
    bookingCode: z
      .string()
      .max(LOOKUP_FIELD_MAX_LENGTH)
      .transform((code) => normalizeBookingCode(code) ?? '')
      .pipe(z.string().min(1, lookupText.invalidCode)),
    contact: z
      .string()
      .trim()
      .max(LOOKUP_FIELD_MAX_LENGTH)
      .transform((contact) => canonicalContact(contact) ?? '')
      .pipe(z.string().min(1, lookupText.invalidContact)),
    turnstileToken: captchaTokenField,
  })
  .strict();

export type PhoneOtpRequest = z.output<typeof requestPhoneOtpSchema>;
export type PhoneOtpCheck = z.output<typeof verifyPhoneOtpSchema>;
export type LookupBookingInput = z.input<typeof lookupBookingSchema>;

// The status hub's manage actions (Task P3.12.02; docs/PRD.md §13.1 A16–A18). The browser sends the booking code and
// what it chose; the refund, the seats and the state are the database's to decide.
const bookingCodeField = z.string().regex(BOOKING_CODE_PATTERN);
const CANCEL_REASON_MAX_LENGTH = 200;

export const cancelBookingSchema = z
  .object({
    bookingCode: bookingCodeField,
    kind: z.enum(DB_ENUMS.refund_request_kind),
    reason: z.string().trim().max(CANCEL_REASON_MAX_LENGTH).optional(),
  })
  .strict();

export const rescheduleBookingSchema = z
  .object({
    bookingCode: bookingCodeField,
    // One new session per leg, in leg order.
    sessionIds: z.array(z.uuid()).min(1).max(MAX_PACKAGE_LEGS),
  })
  .strict();

export const confirmQuotationSchema = z.object({ bookingCode: bookingCodeField }).strict();
