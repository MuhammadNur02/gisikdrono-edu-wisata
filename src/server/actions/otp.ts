'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { OTP_REQUEST_MIN_RESPONSE_MS, OTP_RESEND_COOLDOWN_SECONDS } from '@/config/guest';
import { isPrelaunch } from '@/config/launch';
import type { OtpCheck, OtpIssue } from '@/db/rpc-guest';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import { waitUntilElapsed } from '@/lib/utils/timing';
import {
  requestPhoneOtpSchema,
  verifyPhoneOtpSchema,
  type PhoneOtpCheck,
  type PhoneOtpRequest,
} from '@/lib/validations/guest';
import {
  ensureOtpBrowserId,
  readOtpBrowserCookie,
  rememberPhoneProof,
} from '@/server/auth/guest-cookies';
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
// breaker; these actions add the per-IP limit and Turnstile in front, the browser the code belongs to
// (gsk_otp_browser), and the gsk_phone cookie behind.

const text = copy.booking.otp;

// Review of PR #20, L4: sent, cooldown and limited read alike, so the answer never says that someone else has been
// asking for this number. The form counts down the minute either way.
function requestAnswer(issued: OtpIssue, channel: OtpChannel): ActionResult<OtpRequestAnswer> {
  if (issued.status === 'degraded') return ok({ status: 'degraded' });
  if (issued.status === 'unavailable') return fail('VALIDATION', undefined, text.unavailable);
  return ok({ status: 'requested', channel, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS });
}

async function requestCode(
  request: PhoneOtpRequest,
  clientIp: string,
): Promise<ActionResult<OtpRequestAnswer>> {
  const ipBucket = rateLimitIpBucket(clientIp);
  if (!(await withinGuestLimits([{ name: 'otp_request:ip', subject: ipBucket }]))) {
    return fail('RATE_LIMITED');
  }
  const turnstileAction =
    request.channel === 'email' ? TURNSTILE_ACTIONS.otpEmail : TURNSTILE_ACTIONS.otpRequest;
  if (!(await verifyTurnstile(request.turnstileToken, clientIp, turnstileAction))) {
    return fail('VALIDATION', { turnstileToken: [text.captchaFailed] }, text.captchaFailed);
  }
  const { channel, phone, email } = request;
  const browserId = await ensureOtpBrowserId();
  const issued = await issuePhoneOtp({ channel, phone, email, clientIp, browserId });
  if (issued.status === 'sent') after(kickNotificationWorker);
  return requestAnswer(issued, channel);
}

// Every answer past validation waits out OTP_REQUEST_MIN_RESPONSE_MS, so its timing says no more than its words.
export async function requestPhoneOtpAction(
  input: unknown,
): Promise<ActionResult<OtpRequestAnswer>> {
  const startedAt = Date.now();
  const parsed = requestPhoneOtpSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  // A code only ever proves a phone for a booking, and a pre-launch build books nothing (docs/Security.md §8.9).
  if (isPrelaunch()) return fail('STATE_INVALID', undefined, copy.booking.wizard.prelaunch);
  const clientIp = clientIpFrom(await headers());
  const answer = await requestCode(parsed.data, clientIp).catch((error: unknown) =>
    mapError(error),
  );
  await waitUntilElapsed(startedAt, OTP_REQUEST_MIN_RESPONSE_MS);
  return answer;
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

// The browser's own code for this contact. Review of PR #20, L3: only a code issued to prove a booking's phone counts
// here; the database looks for no other purpose, and a reply that names one is refused all the same.
async function checkCode(check: PhoneOtpCheck, browserId: string): Promise<OtpCheck> {
  const { channel, phone, email, code } = check;
  const checked = await verifyPhoneOtp({ channel, phone, email, code, browserId });
  if (checked.status === 'verified' && checked.purpose !== 'booking_phone') {
    return { status: 'invalid' };
  }
  return checked;
}

export async function verifyPhoneOtpAction(input: unknown): Promise<ActionResult<OtpVerifyAnswer>> {
  const parsed = verifyPhoneOtpSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const clientIp = clientIpFrom(await headers());

  try {
    const ipBucket = rateLimitIpBucket(clientIp);
    if (!(await withinGuestLimits([{ name: 'otp_verify:ip', subject: ipBucket }]))) {
      return fail('RATE_LIMITED');
    }
    // A browser that holds no gsk_otp_browser cookie has no code to check; the proof holds only beside that cookie
    // (review of PR #27, L8).
    const browserId = await readOtpBrowserCookie();
    if (browserId === null) return codeRefusal({ status: 'invalid' });
    const checked = await checkCode(parsed.data, browserId);
    if (checked.status !== 'verified') return codeRefusal(checked);
    // A WhatsApp code proves the number it was sent to, which the database returns; an email code proves only the
    // address, and the phone stays what the visitor typed (src/lib/links/phone-proof.ts).
    const channel: OtpChannel = checked.phone === null ? 'email' : 'whatsapp';
    const proof = {
      channel,
      phone: checked.phone ?? parsed.data.phone,
      email: checked.email,
      otpId: checked.otpId,
    };
    await rememberPhoneProof(proof, browserId);
    return ok({ channel });
  } catch (error) {
    return mapError(error);
  }
}
