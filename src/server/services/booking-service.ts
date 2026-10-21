import 'server-only';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import type { GuestLinkScope } from '@/config/guest';
import {
  svcIssuePhoneOtp,
  svcResendBookingLink,
  svcRevokeGuestLinks,
  svcVerifyPhoneOtp,
  type LinkResend,
  type OtpCheck,
  type OtpIssue,
} from '@/db/rpc-guest';
import type { DatabaseClient } from '@/db/rpc-result';
import { isCurrentLink, readGuestLink } from '@/lib/links/verify';
import { drawOtpCode, otpCodeHash } from '@/lib/otp';
import { withinRateLimits, type RateLimitCheck } from '@/lib/rate-limit';
// Visitors have no session, so their codes, lookups and links run with the service role (CLAUDE.md §6.1). Every
// call is keyed by what the server checked first: an OTP id it issued itself, a booking code with a contact the
// database matches on its own side (the booking's contact never comes back here), or a booking code whose link
// signature has already passed. The limiter is an internal function no API role may call (P1.3.24).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';

// The guest side of a booking (Task P3.2, P3.3): proving the PIC's phone with a one-time code, sending a link again
// from /reservasi/cari, and checking or revoking the links themselves (docs/Security.md §4.1, §6.7).

export function withinGuestLimits(checks: readonly RateLimitCheck[]): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), checks);
}

// guest_otps.ip counts codes per IP for the daily cap: an IPv6 visitor by their /64, like every per-IP limit, and a
// request seen through no proxy (a local server) not at all.
function ipForOtpCaps(clientIp: string): string | null {
  return isIP(clientIp) === 0 ? null : rateLimitIpBucket(clientIp);
}

export function issuePhoneOtp(request: {
  channel: 'whatsapp' | 'email';
  phone: string;
  email: string | null;
  clientIp: string;
}): Promise<OtpIssue> {
  const otpId = randomUUID();
  const code = drawOtpCode();
  return svcIssuePhoneOtp(createSupabaseAdminClient(), {
    otpId,
    purpose: 'booking_phone',
    channel: request.channel,
    codeHash: otpCodeHash(otpId, code),
    code,
    phone: request.channel === 'whatsapp' ? request.phone : null,
    email: request.channel === 'email' ? request.email : null,
    ip: ipForOtpCaps(request.clientIp),
  });
}

export function verifyPhoneOtp(check: { otpId: string; code: string }): Promise<OtpCheck> {
  return svcVerifyPhoneOtp(createSupabaseAdminClient(), {
    otpId: check.otpId,
    codeHash: otpCodeHash(check.otpId, check.code),
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
  const reading = readGuestLink(request.token, request);
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
