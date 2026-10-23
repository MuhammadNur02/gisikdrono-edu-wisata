import 'server-only';

import { isIP } from 'node:net';

import { PRIVACY_NOTICE_VERSION } from '@/config/site';
import type { EnumValue } from '@/db/enums';
import { svcCreateBooking, type BookingToCreate } from '@/db/rpc-guest';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import type { PhoneProof } from '@/lib/links/phone-proof';
import type { RateLimitCheck } from '@/lib/rate-limit';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import type { CreateBookingValues } from '@/lib/validations/booking';
import { normalizeEmail } from '@/lib/validations/normalize';

// What a visitor's booking request becomes for internal.create_booking (Task P3.4.03, P3.5.04), and what they are told
// back. booking-service.ts, the one module here that may create the service-role client, hands it in.

// A booking request as createBookingAction hands it over (Task P3.5.04): the parsed form, and the gsk_phone cookie that
// says which number, or while WhatsApp is degraded which address, the visitor proved. The form carries no phone.
export interface BookingRequest {
  values: CreateBookingValues;
  proof: PhoneProof;
  clientIp: string;
  userAgent: string;
}

// What the visitor is told. A duplicate hold's code is never handed back (BOOK-15): its link goes again to the
// contact that holds it. A form sent again gets its booking as it stands by now, paid or expired included. reverify
// asks for a new code when the database finds the contact unproven (review of PR #27, M1).
export type BookingOutcome =
  | {
      kind: 'created';
      bookingId: string;
      bookingCode: string;
      status: EnumValue<'booking_status'>;
      expiresAt: string | null;
      // The first and last visit day the database booked, whose sessions are revalidated (review of PR #27, L3).
      visitDate: string;
      visitDateEnd: string;
      // The booking's manage link, for the bk_<code> cookie of the browser that made it; never sent to that browser.
      manageToken: string;
    }
  | { kind: 'resent' }
  | { kind: 'pay_to_confirm' }
  | { kind: 'reverify' };

export type ProvenBooker = ReturnType<typeof provenContact>;

// A booker is the contact their code proved (independent review of PR #26, M2): the WhatsApp number, or while WhatsApp
// codes are degraded the address. The number typed beside that address counts against no limit and gets no link.
export function provenContact(proof: PhoneProof) {
  if (proof.channel === 'whatsapp') {
    return {
      limit: 'booking:phone',
      subject: proof.phone,
      phone: proof.phone,
      email: null,
    } as const;
  }
  if (proof.email === null) throw new AppError('STATE_INVALID');
  return {
    limit: 'booking:email',
    subject: normalizeEmail(proof.email),
    phone: null,
    email: proof.email,
  } as const;
}

// docs/Security.md §4.3: five bookings a day per proven contact and ten per IP and browser.
export function bookingLimitsOf(contact: ProvenBooker, request: BookingRequest): RateLimitCheck[] {
  return [
    { name: contact.limit, subject: contact.subject },
    {
      name: 'booking:ip+ua',
      subject: `${rateLimitIpBucket(request.clientIp)}|${request.userAgent}`,
    },
  ];
}

// The PIC's phone and, for an email proof, the address come from the proof, never from the form (review of PR #27,
// M1); so does the privacy notice version, which is the one this server shows (M2).
export function bookingToCreate(
  mode: BookingToCreate['mode'],
  request: BookingRequest,
  contact: ProvenBooker,
): BookingToCreate {
  const { values, proof } = request;
  return {
    packageId: values.packageId,
    sessionIds: values.visitSessionIds,
    pax: values.pax,
    booker: {
      bookerType: values.bookerType,
      institutionName: values.institutionName,
      picName: values.picName,
      picPhone: proof.phone,
      picEmail: contact.email ?? values.picEmail,
      notes: values.notes,
    },
    addons: values.addons,
    participants: values.participants,
    mode,
    idempotencyKey: values.idempotencyKey,
    otpId: proof.otpId,
    consent: { version: PRIVACY_NOTICE_VERSION, guardianConsent: values.guardianConsent },
    clientIp: isIP(request.clientIp) === 0 ? null : request.clientIp,
    userAgent: request.userAgent,
    quoteHash: values.quoteHash,
  };
}

// Postgres breaks a deadlock by failing one of its transactions, which is then safe to run again as a whole. Every
// writer takes the audit chain first, so this is a backstop for a writer that one day does not.
const DEADLOCK_DETECTED = '40P01';

function isDeadlock(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === DEADLOCK_DETECTED
  );
}

export async function createRetryingOnDeadlock(
  adminClient: DatabaseClient,
  booking: BookingToCreate,
) {
  try {
    return await svcCreateBooking(adminClient, booking);
  } catch (error) {
    if (!isDeadlock(error)) throw error;
    return svcCreateBooking(adminClient, booking);
  }
}
