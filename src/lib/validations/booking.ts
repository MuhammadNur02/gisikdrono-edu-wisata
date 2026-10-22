import { z } from 'zod';

import { BOOKING_LIMITS, PARTICIPANT_ROLES } from '@/config/booking';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { MOBILE_PHONE_PATTERN } from '@/lib/utils/phone';
import { captchaTokenField, emailField } from '@/lib/validations/auth';
import { rowIdSchema } from '@/lib/validations/content';
import { freeTextSchema, optionalFreeTextSchema } from '@/lib/validations/free-text';
import { normalizeMobilePhone } from '@/lib/validations/normalize';

// docs/PRD.md FR-BOOK-03 and FR-BOOK-05 (Task P3.1.01), shared by the booking wizard and createBookingAction. It carries
// identifiers and quantities only: the server prices every line from database rows (docs/Security.md §3.2, PAY-03), so
// a price, total or discount key is refused like any other key the schema does not name. The PIC's phone is not here
// either: the action takes it from the cookie the WhatsApp OTP set, never from the form (docs/Security.md §4.1).

const messages = copy.booking.validation;
const limits = BOOKING_LIMITS;
const PHONE_INPUT_MAX_LENGTH = 32;
const CONSENT_VERSION_PATTERN = /^[0-9A-Za-z._-]+$/;
// The SHA-256 hex of src/lib/pricing/quote-hash.ts, as the summary step hands it out.
const QUOTE_HASH_PATTERN = /^[0-9a-f]{64}$/;

// The PIC's WhatsApp number as the OTP field takes it, returned in E.164. Indonesian mobile numbers only, because the
// OTP and the ticket leave by WhatsApp (decision of 2026-10-21, docs/PRD.md §13.1 A13).
export const picPhoneSchema = z
  .string()
  .max(PHONE_INPUT_MAX_LENGTH, messages.phone)
  .transform((value) => normalizeMobilePhone(value) ?? value)
  .pipe(z.string().regex(MOBILE_PHONE_PATTERN, messages.phone));

function hasRepeats(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

const participantSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(limits.participantName.min, messages.participantName)
      .max(limits.participantName.max, messages.participantName),
    groupLabel: z
      .string()
      .trim()
      .max(limits.groupLabel, messages.tooLong(limits.groupLabel))
      .nullish()
      .transform((label) => (label === undefined || label === null || label === '' ? null : label)),
    roleLabel: z
      .enum(PARTICIPANT_ROLES)
      .nullish()
      .transform((role) => role ?? null),
  })
  .strict();

// Task P3.1.01, review of 0005 (L3): the notes are the visitor's own words for the RW's kitchen, which an RW admin reads.
const addonSchema = z
  .object({
    productId: rowIdSchema,
    qty: z
      .int(messages.addonQuantity(limits.addonQuantity))
      .min(1, messages.addonQuantity(limits.addonQuantity))
      .max(limits.addonQuantity, messages.addonQuantity(limits.addonQuantity)),
    notes: optionalFreeTextSchema(limits.addonNotes, {
      tooLong: messages.tooLong(limits.addonNotes),
    }),
  })
  .strict();

interface BookingRules {
  bookerType: EnumValue<'booker_type'>;
  institutionName: string | null;
  pax: number;
  addons: { productId: string }[];
  participants: unknown[];
  guardianConsent: boolean;
}

// Rules across fields. A group other than an individual names its institution (FR-BOOK-03); a participant list needs
// the guardian's consent, since many participants are children (docs/Security.md PDP-01).
function checkAcrossFields(booking: BookingRules, context: z.RefinementCtx): void {
  const refuse = (field: keyof BookingRules, message: string) => {
    context.addIssue({ code: 'custom', path: [field], message });
  };
  if (booking.bookerType !== 'individual' && booking.institutionName === null) {
    refuse('institutionName', messages.institutionName);
  }
  if (hasRepeats(booking.addons.map((addon) => addon.productId))) {
    refuse('addons', messages.addonRepeated);
  }
  if (booking.participants.length > booking.pax)
    refuse('participants', messages.participantsOverPax);
  if (booking.participants.length > 0 && !booking.guardianConsent) {
    refuse('guardianConsent', messages.guardianConsent);
  }
}

// pax runs up to site_settings `booking.max_pax`, which the page reads and hands in, like freeTextSchema's length.
// The package's own min_pax..max_pax is checked by computeBookingQuote, which has the package row.
export function createBookingSchema(maxPax: number) {
  const paxMessage = messages.pax(maxPax);
  return z
    .object({
      packageId: rowIdSchema,
      visitSessionIds: z
        .array(rowIdSchema)
        .min(1, messages.sessions)
        .max(limits.sessions, messages.sessions)
        .refine((ids) => !hasRepeats(ids), messages.sessions),
      visitDate: z.iso.date(messages.visitDate),
      pax: z.int(paxMessage).min(1, paxMessage).max(maxPax, paxMessage),
      bookerType: z.enum(DB_ENUMS.booker_type),
      institutionName: optionalFreeTextSchema(limits.institutionName, {
        tooLong: messages.tooLong(limits.institutionName),
      }),
      picName: freeTextSchema(limits.picName, {
        required: messages.picName,
        tooLong: messages.tooLong(limits.picName),
      }),
      picEmail: emailField,
      notes: optionalFreeTextSchema(limits.notes, { tooLong: messages.tooLong(limits.notes) }),
      addons: z.array(addonSchema).max(limits.addonLines, messages.addonLines(limits.addonLines)),
      participants: z
        .array(participantSchema)
        .max(limits.participants, messages.participants(limits.participants)),
      guardianConsent: z.boolean(),
      consentVersion: z.string().max(limits.consentVersion).regex(CONSENT_VERSION_PATTERN),
      marketingOptIn: z.boolean().default(false),
      idempotencyKey: z.uuid().toLowerCase(),
      // The quote the visitor saw, which internal.create_booking compares with the one it prices (PRICE_MISMATCH).
      quoteHash: z.string(messages.quoteHash).regex(QUOTE_HASH_PATTERN, messages.quoteHash),
      turnstileToken: captchaTokenField,
    })
    .strict()
    .superRefine(checkAcrossFields);
}

type CreateBookingSchema = ReturnType<typeof createBookingSchema>;
export type CreateBookingInput = z.input<CreateBookingSchema>;
export type CreateBookingValues = z.output<CreateBookingSchema>;
