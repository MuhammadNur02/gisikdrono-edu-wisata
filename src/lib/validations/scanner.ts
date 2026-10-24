import { z } from 'zod';

import {
  MAX_ATTENDEE_FACTOR,
  MIN_ATTENDEES,
  OVERRIDE_REASON_MAX_LENGTH,
  PHONE_LAST_DIGITS,
} from '@/config/scanner';
import { DB_ENUMS } from '@/db/enums';
import { scannerCopy } from '@/lib/copy/scanner';
import { QR_TOKEN_PATTERN } from '@/lib/qr/token-pattern';
import { normalizeBookingCode } from '@/lib/utils/codes';
import type {
  ManualCheckInRequest,
  ScanTicketCard,
  VerifyTicketRequest,
  VerifyTicketResponse,
} from '@/types/scanner';

// The scanner's requests and the server's answers (src/types/scanner.ts), read by the PWA and, from Task P4.4.02, by
// POST /api/tickets/verify. The requests are strict: a field the contract does not name is refused. The answer is
// read leniently, because a newer server may add a field an older PWA does not know yet.

const text = scannerCopy.validation;
const PHONE_DIGITS_PATTERN = new RegExp(`^\\d{${String(PHONE_LAST_DIGITS)}}$`);
// A booking code as an officer may type it, spaces and dashes included.
const TYPED_CODE_MAX_LENGTH = 40;
// bookings.pax_count stays far below this; it only keeps a mistyped keypad from reaching the server.
const ATTENDEE_CEILING = 10_000;

const attemptIdField = z.uuid();
const modeField = z.enum(['preview', 'commit']);
const attendeeCountField = z
  .number()
  .int(text.attendees)
  .min(MIN_ATTENDEES, text.attendees)
  .max(ATTENDEE_CEILING, text.attendees)
  .optional();
const overrideReasonField = z.string().trim().min(1).max(OVERRIDE_REASON_MAX_LENGTH).optional();

export const verifyTicketRequestSchema = z
  .object({
    token: z.string().regex(QR_TOKEN_PATTERN),
    attemptId: attemptIdField,
    mode: modeField,
    attendeeCount: attendeeCountField,
    overrideReason: overrideReasonField,
  })
  .strict() satisfies z.ZodType<VerifyTicketRequest>;

export const manualCheckInRequestSchema = z
  .object({
    bookingCode: z
      .string()
      .max(TYPED_CODE_MAX_LENGTH)
      .transform((code) => normalizeBookingCode(code) ?? '')
      .pipe(z.string().min(1, text.bookingCode)),
    phoneLastDigits: z.string().trim().regex(PHONE_DIGITS_PATTERN, text.phoneLastDigits),
    attemptId: attemptIdField,
    mode: modeField,
    attendeeCount: attendeeCountField,
    overrideReason: overrideReasonField,
  })
  .strict() satisfies z.ZodType<ManualCheckInRequest, ManualCheckInRequest>;

// What POST /api/tickets/verify accepts (Task P4.4.02): a decoded QR or the unreadable QR's code and digits. A commit
// says how many came; check_in_ticket checks the count against the booking.
export const scanRequestSchema = z
  .union([verifyTicketRequestSchema, manualCheckInRequestSchema])
  .refine((scan) => scan.mode === 'preview' || scan.attendeeCount !== undefined, {
    path: ['attendeeCount'],
    message: text.attendees,
  });

export type ScanRequest = z.output<typeof scanRequestSchema>;

const ticketCardSchema = z.object({
  ticketCode: z.string(),
  institutionName: z.string().nullable(),
  picFirstName: z.string(),
  packageName: z.string(),
  visitDate: z.string(),
  sessionStart: z.string(),
  sessionEnd: z.string(),
  paxCount: z.number().int().min(1),
  participantCount: z.number().int().min(0),
  addons: z.array(z.object({ name: z.string(), quantity: z.number().int() })),
}) satisfies z.ZodType<ScanTicketCard>;

export const verifyTicketResponseSchema = z.object({
  result: z.enum(DB_ENUMS.scan_result),
  mode: modeField,
  attemptId: attemptIdField,
  ticket: ticketCardSchema.nullable(),
  usedAt: z.string().nullable(),
  usedBy: z.string().nullable(),
  checkedInPax: z.number().int().nullable(),
  unpaidPax: z.number().int().nullable(),
}) satisfies z.ZodType<VerifyTicketResponse>;

export interface AttendeeBounds {
  min: number;
  max: number;
}

// FR-SCAN-04: from one person up to twice the booked group.
export function attendeeBoundsOf(paxCount: number): AttendeeBounds {
  return { min: MIN_ATTENDEES, max: Math.max(MIN_ATTENDEES, paxCount * MAX_ATTENDEE_FACTOR) };
}

// The people above the booking, whom check_in_ticket records as unpaid_pax.
export function unpaidAttendeesOf(attendeeCount: number, paxCount: number): number {
  return Math.max(0, attendeeCount - paxCount);
}

export type ManualCheckInInput = z.input<typeof manualCheckInRequestSchema>;
