'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { OTP_RESEND_COOLDOWN_SECONDS } from '@/config/guest';
import type { OtpCheck, OtpIssue } from '@/db/rpc-guest';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import { requestPhoneOtpSchema, verifyPhoneOtpSchema } from '@/lib/validations/guest';
import { rememberPhoneProof } from '@/server/auth/guest-cookies';
import {
  issuePhoneOtp,
  verifyPhoneOtp,
  withinGuestLimits,
} from '@/server/services/booking-service';
import { kickNotificationWorker } from '@/server/services/notification-service';
import type { ActionResult } from '@/types/action-result';
import type { OtpChannel, OtpRequestAnswer, OtpVerifyAnswer } from '@/types/guest';

// The PIC's phone check before any quota is held (Task P3.2.03; docs/Security.md §4.1, BOOK-12, GUEST-08). The code
// is issued and checked by internal.issue_phone_otp / verify_phone_otp, which also hold the daily caps and the
// breaker; these actions add the per-IP limit and Turnstile in front, and the gsk_phone cookie behind.

const text = copy.booking.otp;

function requestAnswer(issued: OtpIssue, channel: OtpChannel): ActionResult<OtpRequestAnswer> {
  switch (issued.status) {
    case 'sent':
      return ok({
        status: 'sent',
        otpId: issued.otpId,
        channel,
        resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      });
    case 'degraded':
      return ok({ status: 'degraded' });
    case 'cooldown':
      return fail('RATE_LIMITED', undefined, text.cooldown(issued.retryAfterSeconds));
    case 'limited':
      return fail('RATE_LIMITED', undefined, text.limited);
    case 'unavailable':
      return fail('VALIDATION', undefined, text.unavailable);
  }
}

export async function requestPhoneOtpAction(
  input: unknown,
): Promise<ActionResult<OtpRequestAnswer>> {
  const parsed = requestPhoneOtpSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const { channel, phone, email, turnstileToken } = parsed.data;
  const clientIp = clientIpFrom(await headers());

  try {
    const ipBucket = rateLimitIpBucket(clientIp);
    if (!(await withinGuestLimits([{ name: 'otp_request:ip', subject: ipBucket }]))) {
      return fail('RATE_LIMITED');
    }
    const turnstileAction =
      channel === 'email' ? TURNSTILE_ACTIONS.otpEmail : TURNSTILE_ACTIONS.otpRequest;
    if (!(await verifyTurnstile(turnstileToken, clientIp, turnstileAction))) {
      return fail('VALIDATION', { turnstileToken: [text.captchaFailed] }, text.captchaFailed);
    }
    const issued = await issuePhoneOtp({ channel, phone, email, clientIp });
    if (issued.status === 'sent') after(kickNotificationWorker);
    return requestAnswer(issued, channel);
  } catch (error) {
    return mapError(error);
  }
}

const CODE_REFUSALS = {
  locked: text.locked,
  expired: text.expired,
  invalid: text.invalid,
} as const;

function codeRefusal(
  checked: Exclude<OtpCheck, { status: 'verified' }>,
): ActionResult<OtpVerifyAnswer> {
  const message =
    checked.status === 'wrong_code'
      ? text.wrongCode(checked.attemptsLeft)
      : CODE_REFUSALS[checked.status];
  return fail('VALIDATION', { code: [message] }, message);
}

export async function verifyPhoneOtpAction(input: unknown): Promise<ActionResult<OtpVerifyAnswer>> {
  const parsed = verifyPhoneOtpSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const { otpId, code, phone } = parsed.data;
  const clientIp = clientIpFrom(await headers());

  try {
    const ipBucket = rateLimitIpBucket(clientIp);
    if (!(await withinGuestLimits([{ name: 'otp_verify:ip', subject: ipBucket }]))) {
      return fail('RATE_LIMITED');
    }
    const checked = await verifyPhoneOtp({ otpId, code });
    if (checked.status !== 'verified') return codeRefusal(checked);
    // A WhatsApp code proves the number it was sent to, which the database returns; an email code proves only the
    // address, and the phone stays what the visitor typed (src/lib/links/phone-proof.ts).
    const channel: OtpChannel = checked.phone === null ? 'email' : 'whatsapp';
    await rememberPhoneProof({
      channel,
      phone: checked.phone ?? phone,
      email: checked.email,
      otpId,
    });
    return ok({ channel });
  } catch (error) {
    return mapError(error);
  }
}
