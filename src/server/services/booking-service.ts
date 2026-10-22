import 'server-only';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import type { GuestLinkScope } from '@/config/guest';
import type { EnumValue } from '@/db/enums';
import {
  svcCreateBooking,
  svcIssuePhoneOtp,
  svcResendBookingLink,
  svcRevokeGuestLinks,
  svcVerifyPhoneOtp,
  type BookingToCreate,
  type LinkResend,
  type OtpCheck,
  type OtpIssue,
} from '@/db/rpc-guest';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import { mintGuestLink } from '@/lib/links/mint';
import type { PhoneProof } from '@/lib/links/phone-proof';
import { isCurrentLink, readGuestLink } from '@/lib/links/verify';
import { drawOtpCode, otpBrowserHash, otpCodeHash } from '@/lib/otp';
import { withinRateLimits, type RateLimitCheck } from '@/lib/rate-limit';
// Visitors have no session, so their codes, lookups and links run with the service role (CLAUDE.md §6.1). Every
// call is keyed by what the server checked first: the browser id of a cookie it signed itself, a booking code with a
// contact the database matches on its own side (the booking's contact never comes back here), or a booking code
// whose link signature has already passed. The limiter is an internal function no API role may call (P1.3.24).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import type { CreateBookingValues } from '@/lib/validations/booking';
import { normalizeEmail } from '@/lib/validations/normalize';

// The guest side of a booking (Task P3.2, P3.3, P3.4): proving the PIC's phone with a one-time code, making the hold
// or quotation booking itself, sending a link again from /reservasi/cari, and checking or revoking the links
// (docs/Security.md §4.1–§4.4, §6.7).

export function withinGuestLimits(checks: readonly RateLimitCheck[]): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), checks);
}

// guest_otps.ip counts codes per IP for the daily cap: an IPv6 visitor by their /64, like every per-IP limit, and a
// request seen through no proxy (a local server) not at all.
function ipForOtpCaps(clientIp: string): string | null {
  return isIP(clientIp) === 0 ? null : rateLimitIpBucket(clientIp);
}

// The number or address a code goes to: a WhatsApp code is about the phone, an email code about the address alone.
interface OtpContact {
  channel: 'whatsapp' | 'email';
  phone: string;
  email: string | null;
  // The gsk_otp_browser cookie's id (src/server/auth/guest-cookies.ts): the code belongs to this browser.
  browserId: string;
}

function targetOf(contact: OtpContact) {
  return {
    channel: contact.channel,
    phone: contact.channel === 'whatsapp' ? contact.phone : null,
    email: contact.channel === 'email' ? contact.email : null,
  };
}

export function issuePhoneOtp(request: OtpContact & { clientIp: string }): Promise<OtpIssue> {
  const code = drawOtpCode();
  return svcIssuePhoneOtp(createSupabaseAdminClient(), {
    ...targetOf(request),
    otpId: randomUUID(),
    purpose: 'booking_phone',
    browserHash: otpBrowserHash(request.browserId),
    codeHash: otpCodeHash(request.browserId, code),
    code,
    ip: ipForOtpCaps(request.clientIp),
  });
}

export function verifyPhoneOtp(check: OtpContact & { code: string }): Promise<OtpCheck> {
  return svcVerifyPhoneOtp(createSupabaseAdminClient(), {
    ...targetOf(check),
    purpose: 'booking_phone',
    browserHash: otpBrowserHash(check.browserId),
    codeHash: otpCodeHash(check.browserId, check.code),
  });
}

// contact is what lookupBookingSchema made of the visitor's input: an E.164 number or a lower-cased address.
export function resendBookingLink(lookup: {
  bookingCode: string;
  contact: string;
}): Promise<LinkResend> {
  const isEmail = lookup.contact.includes('@');
  return svcResendBookingLink(createSupabaseAdminClient(), {
    bookingCode: lookup.bookingCode,
    phone: isEmail ? null : lookup.contact,
    email: isEmail ? lookup.contact : null,
  });
}

export interface GuestAccess {
  bookingId: string;
  bookingCode: string;
  // The scope of the link held, which may open more than the scope asked for (a manage link opens a view page).
  scope: GuestLinkScope;
}

async function tokenVersionOf(adminClient: DatabaseClient, bookingCode: string) {
  const { data, error } = await adminClient
    .from('bookings')
    .select('id, token_version')
    .eq('booking_code', bookingCode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// docs/Security.md GUEST-02, APP-15: null for a link that is forged, expired, revoked, for another booking or too
// narrow for the page, and for a visitor over the link limit. The signature is checked before the database is asked.
export async function verifyGuestAccess(request: {
  bookingCode: string;
  token: string;
  required: GuestLinkScope;
  clientIp: string;
  nowSeconds: number;
}): Promise<GuestAccess | null> {
  const adminClient = createSupabaseAdminClient();
  const ip = rateLimitIpBucket(request.clientIp);
  if (!(await withinRateLimits(adminClient, [{ name: 'link_verify:ip', subject: ip }])))
    return null;
  const reading = await readGuestLink(request.token, request);
  if (!reading.ok) return null;
  const booking = await tokenVersionOf(adminClient, request.bookingCode);
  const isCurrent =
    booking !== null &&
    isCurrentLink(reading.link, {
      tokenVersion: booking.token_version,
      required: request.required,
    });
  return isCurrent
    ? { bookingId: booking.id, bookingCode: request.bookingCode, scope: reading.link.s }
    : null;
}

export async function revokeGuestLinks(bookingId: string): Promise<void> {
  await svcRevokeGuestLinks(createSupabaseAdminClient(), bookingId);
}

// A booking request as createBookingAction hands it over (Task P3.5.04): the parsed form, and the gsk_phone cookie that
// says which number, or while WhatsApp is degraded which address, the visitor proved. The form carries no phone.
export interface BookingRequest {
  values: CreateBookingValues;
  proof: PhoneProof;
  clientIp: string;
  userAgent: string;
}

// What the visitor is told. A duplicate hold's code is never handed back (BOOK-15): its link goes again to the
// contact that holds it. A form sent again gets its booking as it stands by now, paid or expired included.
export type BookingOutcome =
  | {
      kind: 'created';
      bookingCode: string;
      status: EnumValue<'booking_status'>;
      expiresAt: string | null;
      // The booking's manage link, for the bk_<code> cookie of the browser that made it; never sent to that browser.
      manageToken: string;
    }
  | { kind: 'resent' }
  | { kind: 'pay_to_confirm' };

function bookingToCreate(mode: BookingToCreate['mode'], request: BookingRequest): BookingToCreate {
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
      picEmail: values.picEmail,
      notes: values.notes,
    },
    addons: values.addons,
    participants: values.participants,
    mode,
    idempotencyKey: values.idempotencyKey,
    otpId: proof.otpId,
    consentVersion: values.consentVersion,
    clientIp: isIP(request.clientIp) === 0 ? null : request.clientIp,
    userAgent: request.userAgent,
    quoteHash: values.quoteHash,
  };
}

// A booker is the contact their code proved (independent review of PR #26, M2): the WhatsApp number, or while WhatsApp
// codes are degraded the address. The number typed beside that address counts against no limit and gets no link.
function provenContact(proof: PhoneProof) {
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

async function createRetryingOnDeadlock(adminClient: DatabaseClient, booking: BookingToCreate) {
  try {
    return await svcCreateBooking(adminClient, booking);
  } catch (error) {
    if (!isDeadlock(error)) throw error;
    return svcCreateBooking(adminClient, booking);
  }
}

const MS_PER_SECOND = 1000;

// docs/Security.md §3.2 (decision of 2026-10-22 on P3.5, Q1): the browser that proved the PIC's contact and made the
// booking holds its manage link at once, as the WhatsApp number or the proven address receives it.
async function manageLinkFor(adminClient: DatabaseClient, bookingCode: string): Promise<string> {
  const booking = await tokenVersionOf(adminClient, bookingCode);
  if (!booking) throw new AppError('NOT_FOUND');
  return mintGuestLink({
    bookingCode,
    scope: 'manage',
    tokenVersion: booking.token_version,
    nowSeconds: Math.floor(Date.now() / MS_PER_SECOND),
  });
}

// docs/Security.md §4.3: five bookings a day per proven contact and ten per IP and browser, counted before the
// database is asked. Everything else, from the price to the caps per contact and per session, internal.create_booking
// decides.
async function submitBooking(
  mode: BookingToCreate['mode'],
  request: BookingRequest,
): Promise<BookingOutcome> {
  const adminClient = createSupabaseAdminClient();
  const contact = provenContact(request.proof);
  const isWithinLimits = await withinRateLimits(adminClient, [
    { name: contact.limit, subject: contact.subject },
    {
      name: 'booking:ip+ua',
      subject: `${rateLimitIpBucket(request.clientIp)}|${request.userAgent}`,
    },
  ]);
  if (!isWithinLimits) throw new AppError('RATE_LIMITED');

  const reply = await createRetryingOnDeadlock(adminClient, bookingToCreate(mode, request));
  if (reply.result === 'pay_to_confirm') return { kind: 'pay_to_confirm' };
  if (reply.result === 'duplicate') {
    await svcResendBookingLink(adminClient, {
      bookingCode: reply.bookingCode,
      phone: contact.phone,
      email: contact.email,
    });
    return { kind: 'resent' };
  }
  return {
    kind: 'created',
    bookingCode: reply.bookingCode,
    status: reply.status,
    expiresAt: reply.expiresAt,
    manageToken: await manageLinkFor(adminClient, reply.bookingCode),
  };
}

// "Konfirmasi & Bayar": a hold, the seats reserved until its deadline (Task P3.4.03).
export function createHold(request: BookingRequest): Promise<BookingOutcome> {
  return submitBooking('pay', request);
}

// "Minta Surat Penawaran": a quotation booking, no seat held; the quotation itself comes from create_quotation.
export function createQuotedBooking(request: BookingRequest): Promise<BookingOutcome> {
  return submitBooking('quote', request);
}
