import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { Database } from '@/db/types';

// Typed calls to the guest functions (supabase/migrations/20261021110100_browser_bound_otps.sql,
// 20261021100300_guest_link_functions.sql and 20261022120000_booking_functions.sql), on the service-role client only:
// visitors have no session.

type Enums = Database['public']['Enums'];

const issueReplySchema = z.discriminatedUnion('result', [
  z.strictObject({ result: z.literal('sent'), otp_id: z.uuid(), expires_at: z.string() }),
  z.strictObject({ result: z.literal('cooldown'), retry_after: z.int().nonnegative() }),
  z.strictObject({ result: z.enum(['degraded', 'unavailable', 'limited']) }),
]);

export type OtpIssue =
  | { status: 'sent'; otpId: string; expiresAt: string }
  | { status: 'cooldown'; retryAfterSeconds: number }
  | { status: 'degraded' | 'unavailable' | 'limited' };

export interface OtpToIssue {
  otpId: string;
  purpose: Enums['otp_purpose'];
  channel: Enums['notification_channel'];
  // The keyed hashes of src/lib/otp.ts, in hex: the browser the code belongs to, and the code itself. The plain code
  // travels only into the outbox message.
  browserHash: string;
  codeHash: string;
  code: string;
  phone: string | null;
  email: string | null;
  ip: string | null;
}

export async function svcIssuePhoneOtp(
  adminClient: DatabaseClient,
  otp: OtpToIssue,
): Promise<OtpIssue> {
  const reply = issueReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_issue_phone_otp', {
        p_otp_id: otp.otpId,
        p_purpose: otp.purpose,
        p_channel: otp.channel,
        p_browser_hash: otp.browserHash,
        p_code_hash: otp.codeHash,
        p_code: otp.code,
        p_phone: otp.phone ?? undefined,
        p_email: otp.email ?? undefined,
        p_ip: otp.ip ?? undefined,
      }),
    ),
  );
  if (reply.result === 'sent') {
    return { status: 'sent', otpId: reply.otp_id, expiresAt: reply.expires_at };
  }
  if (reply.result === 'cooldown')
    return { status: 'cooldown', retryAfterSeconds: reply.retry_after };
  return { status: reply.result };
}

const checkReplySchema = z.discriminatedUnion('result', [
  z.strictObject({
    result: z.literal('verified'),
    otp_id: z.uuid(),
    purpose: z.enum(['booking_phone', 'dsr_identity']),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  z.strictObject({ result: z.literal('wrong_code'), attempts_left: z.int().nonnegative() }),
  z.strictObject({ result: z.enum(['locked', 'expired', 'invalid']) }),
]);

export type OtpCheck =
  | {
      status: 'verified';
      otpId: string;
      purpose: Enums['otp_purpose'];
      phone: string | null;
      email: string | null;
    }
  | { status: 'wrong_code'; attemptsLeft: number }
  | { status: 'locked' | 'expired' | 'invalid' };

export interface OtpToCheck {
  purpose: Enums['otp_purpose'];
  channel: Enums['notification_channel'];
  browserHash: string;
  codeHash: string;
  phone: string | null;
  email: string | null;
}

// The database finds the code by purpose, channel, number or address and browser; nothing the visitor holds names a
// row.
export async function svcVerifyPhoneOtp(
  adminClient: DatabaseClient,
  check: OtpToCheck,
): Promise<OtpCheck> {
  const reply = checkReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_verify_phone_otp', {
        p_purpose: check.purpose,
        p_channel: check.channel,
        p_browser_hash: check.browserHash,
        p_code_hash: check.codeHash,
        p_phone: check.phone ?? undefined,
        p_email: check.email ?? undefined,
      }),
    ),
  );
  if (reply.result === 'verified') {
    const { otp_id: otpId, purpose, phone, email } = reply;
    return { status: 'verified', otpId, purpose, phone, email };
  }
  if (reply.result === 'wrong_code')
    return { status: 'wrong_code', attemptsLeft: reply.attempts_left };
  return { status: reply.result };
}

const resendReplySchema = z.enum(['queued', 'capped', 'no_match']);
export type LinkResend = z.infer<typeof resendReplySchema>;

// The visitor sees the same answer whatever this returns (docs/Security.md GUEST-01).
export async function svcResendBookingLink(
  adminClient: DatabaseClient,
  lookup: { bookingCode: string; phone: string | null; email: string | null },
): Promise<LinkResend> {
  return resendReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_resend_booking_link', {
        p_booking_code: lookup.bookingCode,
        p_phone: lookup.phone ?? undefined,
        p_email: lookup.email ?? undefined,
      }),
    ),
  );
}

// Returns the booking's new token_version; every link minted before it stops working.
export function svcRevokeGuestLinks(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<number> {
  return resultOf(adminClient.rpc('svc_revoke_guest_links', { p_booking_id: bookingId }));
}

const BOOKING_CODE = /^GSK-[0-9A-HJKMNP-TV-Z]{8}$/;

// A form sent again answers with its booking as it stands by now, which may be paid, expired or cancelled already
// (independent review of PR #26, L6).
const bookingReplySchema = z.union([
  z.strictObject({
    result: z.enum(['created', 'existing', 'duplicate']),
    booking_id: z.uuid(),
    booking_code: z.string().regex(BOOKING_CODE),
    status: z.enum(DB_ENUMS.booking_status),
    expires_at: z.string().nullable(),
  }),
  z.strictObject({ result: z.literal('pay_to_confirm') }),
]);

export type BookingReply =
  | {
      result: 'created' | 'existing' | 'duplicate';
      bookingId: string;
      bookingCode: string;
      status: Enums['booking_status'];
      expiresAt: string | null;
    }
  | { result: 'pay_to_confirm' };

// What booking-service.ts asks internal.create_booking for: identifiers and quantities from the form, the PIC's phone
// and code from the verified cookie, and the summary's quote hash. No price travels.
export interface BookingToCreate {
  packageId: string;
  sessionIds: string[];
  pax: number;
  booker: {
    bookerType: Enums['booker_type'];
    institutionName: string | null;
    picName: string;
    picPhone: string;
    picEmail: string;
    notes: string | null;
  };
  addons: { productId: string; qty: number; notes: string | null }[];
  participants: { fullName: string; groupLabel: string | null; roleLabel: string | null }[];
  mode: 'pay' | 'quote';
  idempotencyKey: string;
  otpId: string;
  consentVersion: string;
  clientIp: string | null;
  userAgent: string;
  quoteHash: string;
}

function bookingArgs(booking: BookingToCreate) {
  const { booker } = booking;
  return {
    p_package_id: booking.packageId,
    p_session_ids: booking.sessionIds,
    p_pax: booking.pax,
    p_booker: {
      booker_type: booker.bookerType,
      institution_name: booker.institutionName,
      pic_name: booker.picName,
      pic_phone: booker.picPhone,
      pic_email: booker.picEmail,
      notes: booker.notes,
    },
    p_addons: booking.addons.map((addon) => ({
      product_id: addon.productId,
      qty: addon.qty,
      notes: addon.notes,
    })),
    p_participants: booking.participants.map((participant) => ({
      full_name: participant.fullName,
      group_label: participant.groupLabel,
      role_label: participant.roleLabel,
    })),
    p_mode: booking.mode,
    p_idempotency_key: booking.idempotencyKey,
    p_otp_id: booking.otpId,
    p_consent: { version: booking.consentVersion },
    p_client_meta: { ip: booking.clientIp, user_agent: booking.userAgent },
    p_quote_hash: booking.quoteHash,
  };
}

// Refusals (a full session, a changed price, the caps, an unverified contact) come back as the Postgres error, which
// mapError reads by its hint.
export async function svcCreateBooking(
  adminClient: DatabaseClient,
  booking: BookingToCreate,
): Promise<BookingReply> {
  const reply = bookingReplySchema.parse(
    await resultOf(adminClient.rpc('svc_create_booking', bookingArgs(booking))),
  );
  if (reply.result === 'pay_to_confirm') return reply;
  return {
    result: reply.result,
    bookingId: reply.booking_id,
    bookingCode: reply.booking_code,
    status: reply.status,
    expiresAt: reply.expires_at,
  };
}
