import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { Database } from '@/db/types';

// Typed calls to the guest identity functions (supabase/migrations/20261021100100_guest_otp_functions.sql and
// 20261021100300_guest_link_functions.sql), on the service-role client only: visitors have no session.

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
  // HMAC-SHA256(OTP_PEPPER, otpId:code) in hex; the plain code travels only into the outbox message.
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
    purpose: z.enum(['booking_phone', 'dsr_identity']),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  z.strictObject({ result: z.literal('wrong_code'), attempts_left: z.int().nonnegative() }),
  z.strictObject({ result: z.enum(['locked', 'expired', 'invalid']) }),
]);

export type OtpCheck =
  | { status: 'verified'; phone: string | null; email: string | null }
  | { status: 'wrong_code'; attemptsLeft: number }
  | { status: 'locked' | 'expired' | 'invalid' };

export async function svcVerifyPhoneOtp(
  adminClient: DatabaseClient,
  check: { otpId: string; codeHash: string },
): Promise<OtpCheck> {
  const reply = checkReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_verify_phone_otp', {
        p_otp_id: check.otpId,
        p_code_hash: check.codeHash,
      }),
    ),
  );
  if (reply.result === 'verified') {
    return { status: 'verified', phone: reply.phone, email: reply.email };
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
