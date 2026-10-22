import 'server-only';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import type { GuestLinkScope } from '@/config/guest';
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
// number that holds it.
export type BookingOutcome =
  | {
      kind: 'created';
      bookingCode: string;
      status: 'quoted' | 'pending_payment';
      expiresAt: string | null;
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

// docs/Security.md §4.3: five bookings a day per phone and ten per IP and browser, counted before the database is
// asked. Everything else, from the price to the caps per contact and per session, internal.create_booking decides.
async function submitBooking(
  mode: BookingToCreate['mode'],
  request: BookingRequest,
): Promise<BookingOutcome> {
  const adminClient = createSupabaseAdminClient();
  const isWithinLimits = await withinRateLimits(adminClient, [
    { name: 'booking:phone', subject: request.proof.phone },
    {
      name: 'booking:ip+ua',
      subject: `${rateLimitIpBucket(request.clientIp)}|${request.userAgent}`,
    },
  ]);
  if (!isWithinLimits) throw new AppError('RATE_LIMITED');

  const reply = await svcCreateBooking(adminClient, bookingToCreate(mode, request));
  if (reply.result === 'pay_to_confirm') return { kind: 'pay_to_confirm' };
  if (reply.result === 'duplicate') {
    await svcResendBookingLink(adminClient, {
      bookingCode: reply.bookingCode,
      phone: request.proof.phone,
      email: null,
    });
    return { kind: 'resent' };
  }
  return {
    kind: 'created',
    bookingCode: reply.bookingCode,
    status: reply.status,
    expiresAt: reply.expiresAt,
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
