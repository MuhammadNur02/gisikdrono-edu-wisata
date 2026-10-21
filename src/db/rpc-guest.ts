import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { Database } from '@/db/types';

// Typed calls to the guest identity functions (supabase/migrations/20261021110100_browser_bound_otps.sql and
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
