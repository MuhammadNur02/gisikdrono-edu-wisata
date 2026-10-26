'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { OTP_REQUEST_MIN_RESPONSE_MS } from '@/config/guest';
import { dsrCopy } from '@/lib/copy/dsr';
import { fail, mapError, ok } from '@/lib/errors';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import { waitUntilElapsed } from '@/lib/utils/timing';
import { confirmDsrSchema, downloadDsrSchema, requestDsrCodeSchema } from '@/lib/validations/dsr';
import { requireGuestToken } from '@/server/auth/guards';
import { ensureOtpBrowserId, readOtpBrowserCookie } from '@/server/auth/guest-cookies';
import { guestDsr, withinGuestLimits } from '@/server/services/booking-service';
import { kickNotificationWorker } from '@/server/services/notification-service';
import type { ActionResult } from '@/types/action-result';

// The guest's side of a data request on /reservasi/<code>/privasi (Task P4.10.03; docs/Security.md §7.6, GUEST-10). The
// confirmation needs the booking's manage link, as every change to a booking does, and a dsr_identity code to the
// booking's own verified number, which internal.issue_phone_otp sends with the caps and pepper of a booking's code; the
// export opens with a view link. The number is never typed: the database takes the booking's own.

const text = dsrCopy.guest;

export async function requestDsrCodeAction(input: unknown): Promise<ActionResult<null>> {
  const startedAt = Date.now();
  const parsed = requestDsrCodeSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const clientIp = clientIpFrom(await headers());
  const answer = await sendCode(parsed.data, clientIp).catch((error: unknown) => mapError(error));
  await waitUntilElapsed(startedAt, OTP_REQUEST_MIN_RESPONSE_MS);
  return answer;
}

async function sendCode(
  request: { bookingCode: string; turnstileToken: string },
  clientIp: string,
): Promise<ActionResult<null>> {
  if (
    !(await withinGuestLimits([{ name: 'otp_request:ip', subject: rateLimitIpBucket(clientIp) }]))
  ) {
    return fail('RATE_LIMITED');
  }
  if (!(await verifyTurnstile(request.turnstileToken, clientIp, TURNSTILE_ACTIONS.dsrCode))) {
    return fail('VALIDATION', { turnstileToken: [text.captchaFailed] }, text.captchaFailed);
  }
  const guard = await requireGuestToken(request.bookingCode, 'manage');
  if (!guard.ok) return guard;
  const browserId = await ensureOtpBrowserId();
  const issued = await guestDsr.issueCode({
    bookingId: guard.guest.bookingId,
    browserId,
    clientIp,
  });
  if (issued === 'sent') {
    after(kickNotificationWorker);
    return ok(null);
  }
  if (issued === 'unavailable') return fail('VALIDATION', undefined, text.unavailable);
  return fail('RATE_LIMITED', undefined, issued === 'none' ? text.empty : text.limited);
}

const CODE_REFUSALS = {
  wrong_code: text.wrongCode,
  locked: text.lockedCode,
  expired: text.expiredCode,
} as const;

export async function confirmDsrIdentityAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = confirmDsrSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const clientIp = clientIpFrom(await headers());

  try {
    if (
      !(await withinGuestLimits([{ name: 'otp_verify:ip', subject: rateLimitIpBucket(clientIp) }]))
    ) {
      return fail('RATE_LIMITED');
    }
    const guard = await requireGuestToken(parsed.data.bookingCode, 'manage');
    if (!guard.ok) return guard;
    const browserId = await readOtpBrowserCookie();
    if (browserId === null)
      return fail('VALIDATION', { code: [text.expiredCode] }, text.expiredCode);
    const checked = await guestDsr.confirm({
      bookingId: guard.guest.bookingId,
      browserId,
      code: parsed.data.code,
    });
    if (checked !== 'verified') {
      const message = CODE_REFUSALS[checked];
      return fail('VALIDATION', { code: [message] }, message);
    }
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// A signed URL of five minutes to the guest's own export, never stored or sent anywhere else (CLAUDE.md §6.6).
export async function downloadDsrExportAction(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  const parsed = downloadDsrSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'view');
  if (!guard.ok) return guard;

  try {
    const url = await guestDsr.downloadUrl({
      bookingId: guard.guest.bookingId,
      format: parsed.data.format,
      fileName: `data-${guard.guest.bookingCode}.${parsed.data.format}`,
    });
    return url === null ? fail('NOT_FOUND', undefined, text.downloadFailed) : ok({ url });
  } catch (error) {
    return mapError(error);
  }
}
