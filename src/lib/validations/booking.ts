import { z } from 'zod';

import { BOOKING_LIMITS, PARTICIPANT_ROLES } from '@/config/booking';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { walkInCopy } from '@/lib/copy/walk-in';
import { INTERNATIONAL_PHONE_PATTERN, MOBILE_PHONE_PATTERN } from '@/lib/utils/phone';
import { captchaTokenField, emailField } from '@/lib/validations/auth';
import { rowIdSchema, slugSchema } from '@/lib/validations/content';
import { freeTextSchema, optionalFreeTextSchema } from '@/lib/validations/free-text';
import { normalizeInternationalPhone, normalizeMobilePhone } from '@/lib/validations/normalize';

// docs/PRD.md FR-BOOK-03 and FR-BOOK-05 (Task P3.1.01), shared by the booking wizard and createBookingAction. It carries
// identifiers and quantities only: the server prices every line from database rows (docs/Security.md §3.2, PAY-03), so
// a price, total or discount key is refused like any other key the schema does not name. The PIC's phone is not here
// either: the action takes it from the cookie the WhatsApp OTP set, never from the form (docs/Security.md §4.1). Nor is
// the privacy notice version, which the server records as the one it shows (review of PR #27, M2).

const messages = copy.booking.validation;
const limits = BOOKING_LIMITS;
const PHONE_INPUT_MAX_LENGTH = 32;
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

// A group other than an individual names its institution (FR-BOOK-03).
function requireInstitution(
  booker: { bookerType: EnumValue<'booker_type'>; institutionName: string | null },
  context: z.RefinementCtx,
): void {
  if (booker.bookerType !== 'individual' && booker.institutionName === null) {
    context.addIssue({
      code: 'custom',
      path: ['institutionName'],
      message: messages.institutionName,
    });
  }
}

// No more names than visitors, and a participant list needs the guardian's consent, since many participants are
// children (docs/Security.md PDP-01).
function checkParticipants(
  booking: { pax: number; participants: unknown[]; guardianConsent: boolean },
  context: z.RefinementCtx,
): void {
  if (booking.participants.length > booking.pax) {
    context.addIssue({
      code: 'custom',
      path: ['participants'],
      message: messages.participantsOverPax,
    });
  }
  if (booking.participants.length > 0 && !booking.guardianConsent) {
    context.addIssue({
      code: 'custom',
      path: ['guardianConsent'],
      message: messages.guardianConsent,
    });
  }
}

function refuseRepeatedAddons(
  booking: { addons: { productId: string }[] },
  context: z.RefinementCtx,
) {
  if (hasRepeats(booking.addons.map((addon) => addon.productId))) {
    context.addIssue({ code: 'custom', path: ['addons'], message: messages.addonRepeated });
  }
}

// pax runs up to site_settings `booking.max_pax`, which the page reads and hands in, like freeTextSchema's length.
// The package's own min_pax..max_pax is checked by computeBookingQuote, which has the package row.
function scheduleFields(maxPax: number) {
  const paxMessage = messages.pax(maxPax);
  return {
    visitSessionIds: z
      .array(rowIdSchema)
      .min(1, messages.sessions)
      .max(limits.sessions, messages.sessions)
      .refine((ids) => !hasRepeats(ids), messages.sessions),
    visitDate: z.iso.date(messages.visitDate),
    pax: z.int(paxMessage).min(1, paxMessage).max(maxPax, paxMessage),
  };
}

const bookerFields = {
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
  participants: z
    .array(participantSchema)
    .max(limits.participants, messages.participants(limits.participants)),
  guardianConsent: z.boolean(),
};

const addonFields = {
  addons: z.array(addonSchema).max(limits.addonLines, messages.addonLines(limits.addonLines)),
};

// Decision of 2026-10-22 on P3.5 (Q3, Q4): the visitor ticks that they read the privacy notice, whose version the
// server stores with the booking; no marketing consent is asked for, since nothing would use it.
const summaryFields = {
  privacyAccepted: z.literal(true, messages.privacyAccepted),
  turnstileToken: captchaTokenField,
};

export function createBookingSchema(maxPax: number) {
  return z
    .object({
      packageId: rowIdSchema,
      ...scheduleFields(maxPax),
      ...bookerFields,
      ...addonFields,
      ...summaryFields,
      idempotencyKey: z.uuid().toLowerCase(),
      // The quote the visitor saw, which internal.create_booking compares with the one it prices (PRICE_MISMATCH).
      quoteHash: z.string(messages.quoteHash).regex(QUOTE_HASH_PATTERN, messages.quoteHash),
    })
    .strict()
    .superRefine((booking, context) => {
      requireInstitution(booking, context);
      refuseRepeatedAddons(booking, context);
      checkParticipants(booking, context);
    });
}

// Task P4.3.10 (docs/PRD.md §13.1 A13): the officer's booking at the counter, submitted to createAdminBookingAction.
// The same identifiers and quantities as the web, priced by the server; the PIC's number may be Indonesian or from
// abroad in E.164, since no OTP checks it here: the officer does, and says so (isPhoneConfirmed). No add-ons or
// participant list yet.
export const adminPicPhoneSchema = z
  .string()
  .max(PHONE_INPUT_MAX_LENGTH, walkInCopy.validation.phone)
  .transform((value) => normalizeInternationalPhone(value) ?? value)
  .pipe(z.string().regex(INTERNATIONAL_PHONE_PATTERN, walkInCopy.validation.phone));

export function createAdminBookingSchema(maxPax: number) {
  const { visitSessionIds, pax } = scheduleFields(maxPax);
  const { bookerType, institutionName, picName, picEmail, notes } = bookerFields;
  return z
    .object({
      packageId: rowIdSchema,
      visitSessionIds,
      pax,
      bookerType,
      institutionName,
      picName,
      picPhone: adminPicPhoneSchema,
      picEmail,
      notes,
      isPhoneConfirmed: z.boolean(),
      isCashOnTheSpot: z.boolean(),
      consentAttested: z.literal(true, walkInCopy.validation.consentAttested),
      idempotencyKey: z.uuid().toLowerCase(),
      quoteHash: z.string(messages.quoteHash).regex(QUOTE_HASH_PATTERN, messages.quoteHash),
    })
    .strict()
    .superRefine(requireInstitution);
}
export type CreateAdminBookingInput = z.input<ReturnType<typeof createAdminBookingSchema>>;
export type CreateAdminBookingValues = z.output<ReturnType<typeof createAdminBookingSchema>>;

type CreateBookingSchema = ReturnType<typeof createBookingSchema>;
export type CreateBookingInput = z.input<CreateBookingSchema>;
export type CreateBookingValues = z.output<CreateBookingSchema>;

// Task P3.5.01: one slice per wizard step, each a part of createBookingSchema, which createBookingAction checks whole.
export function scheduleStepSchema(maxPax: number) {
  return z.object(scheduleFields(maxPax)).strict();
}

// The group size comes from the jadwal step, since the participant list may not outgrow it.
export function bookerStepSchema(pax: number) {
  return z
    .object(bookerFields)
    .strict()
    .superRefine((booker, context) => {
      requireInstitution(booker, context);
      checkParticipants({ ...booker, pax }, context);
    });
}

export const addonsStepSchema = z.object(addonFields).strict().superRefine(refuseRepeatedAddons);

export const summaryStepSchema = z.object(summaryFields).strict();

// What the wizard's three actions are asked (Task P3.5.01, P3.5.03, P3.5.04). The package is named by its slug, as
// in the address. createBookingAction checks the booking itself with createBookingSchema once it has read the
// package's booking.max_pax.
export const packageRequestSchema = z.object({ packageSlug: slugSchema }).strict();

export const quotePreviewSchema = z
  .object({
    packageSlug: slugSchema,
    // The package's own min_pax..max_pax is the quote's answer to give, not a refusal.
    pax: z.int().positive(),
    addons: z
      .array(
        z
          .object({ productId: rowIdSchema, qty: z.int().min(1).max(limits.addonQuantity) })
          .strict(),
      )
      .max(limits.addonLines),
  })
  .strict();

export const BOOKING_MODES = ['pay', 'quote'] as const;
export type BookingMode = (typeof BOOKING_MODES)[number];

// Review of PR #27, M1: the contact the summary shows as verified, which proves nothing itself. createBookingAction
// holds it against the gsk_phone cookie, which this browser's other tabs share, and asks for a new code when they
// differ, so a booking is never made for a contact other than the one on screen.
const shownContactSchema = z
  .object({
    channel: z.enum(['whatsapp', 'email']),
    phone: picPhoneSchema,
    email: emailField.nullable(),
  })
  .strict()
  .nullable();

export type ShownContact = z.output<typeof shownContactSchema>;

// The same request reaches createBookingAction for a hold and requestQuotationAction for a quotation (Task P3.6.06).
export const bookingRequestSchema = z
  .object({
    packageSlug: slugSchema,
    booking: z.unknown(),
    shownContact: shownContactSchema,
  })
  .strict();
