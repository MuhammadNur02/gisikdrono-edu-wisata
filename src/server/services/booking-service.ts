import 'server-only';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import type { GuestLinkScope } from '@/config/guest';
import {
  svcIssuePhoneOtp,
  svcResendBookingLink,
  svcRevokeGuestLinks,
  svcVerifyPhoneOtp,
  type BookingReply,
  type BookingToCreate,
  type LinkResend,
  type OtpCheck,
  type OtpIssue,
} from '@/db/rpc-guest';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError, raisedHintOf } from '@/lib/errors';
import { mintGuestLink } from '@/lib/links/mint';
import { isCurrentLink, readGuestLink } from '@/lib/links/verify';
import { drawOtpCode, otpBrowserHash, otpCodeHash } from '@/lib/otp';
import { refundRateLimits, withinRateLimits, type RateLimitCheck } from '@/lib/rate-limit';
// Visitors have no session, so their codes, lookups and links run with the service role (CLAUDE.md §6.1). Every
// call is keyed by what the server checked first: the browser id of a cookie it signed itself, a booking code with a
// contact the database matches on its own side (the booking's contact never comes back here), or a booking code
// whose link signature has already passed. The limiter is an internal function no API role may call (P1.3.24).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import {
  bookingLimitsOf,
  bookingToCreate,
  createRetryingOnDeadlock,
  provenContact,
  type BookingOutcome,
  type BookingRequest,
} from '@/server/services/booking-request';

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

const CONTACT_UNVERIFIED = 'CONTACT_UNVERIFIED';
const SESSION_FULL = 'QUOTA_UNAVAILABLE';

// The database's answer, with two refusals this service settles itself (review of PR #27). An unproven contact asks
// for a new code (M1). A refusal the visitor could not have avoided (a session that filled, one half held unpaid, a
// hold or a booking they already have) gives the day's hits back, so a school trying again from one computer is not
// locked out; a new booking, and a refusal they could have avoided or that looks like abuse, keeps them (L2).
async function bookAndSettleLimits(
  adminClient: DatabaseClient,
  booking: BookingToCreate,
  limits: readonly RateLimitCheck[],
): Promise<BookingReply | { result: 'reverify' }> {
  try {
    const reply = await createRetryingOnDeadlock(adminClient, booking);
    if (reply.result !== 'created') await refundRateLimits(adminClient, limits);
    return reply;
  } catch (error) {
    const hint = raisedHintOf(error);
    if (hint === CONTACT_UNVERIFIED) return { result: 'reverify' };
    if (hint === SESSION_FULL) await refundRateLimits(adminClient, limits);
    throw error;
  }
}

// docs/Security.md §4.3: the day's bookings per proven contact and per IP and browser, counted before the database
// is asked. Everything else, from the price to the caps per contact and per session, internal.create_booking decides.
async function submitBooking(
  mode: BookingToCreate['mode'],
  request: BookingRequest,
): Promise<BookingOutcome> {
  const adminClient = createSupabaseAdminClient();
  const contact = provenContact(request.proof);
  const limits = bookingLimitsOf(contact, request);
  if (!(await withinRateLimits(adminClient, limits))) throw new AppError('RATE_LIMITED');

  const booking = bookingToCreate(mode, request, contact);
  const reply = await bookAndSettleLimits(adminClient, booking, limits);
  if (reply.result === 'reverify' || reply.result === 'pay_to_confirm')
    return { kind: reply.result };
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
    visitDate: reply.visitDate,
    visitDateEnd: reply.visitDateEnd,
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
