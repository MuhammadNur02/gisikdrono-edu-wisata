'use server';

import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { PHONE_PROOF_FRESH_SECONDS } from '@/config/booking';
import {
  GUEST_BOOKING_PATH,
  LOOKUP_MIN_RESPONSE_MS,
  PHONE_PROOF_TTL_SECONDS,
} from '@/config/guest';
import { bookingHubCopy } from '@/lib/copy/booking-hub';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { guestLinkCookieNames } from '@/lib/links/token';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';
import { waitUntilElapsed } from '@/lib/utils/timing';
import {
  cancelBookingSchema,
  confirmQuotationSchema,
  lookupBookingSchema,
  rescheduleBookingSchema,
} from '@/lib/validations/guest';
import { requireGuestToken } from '@/server/auth/guards';
import { readPhoneProofCookie } from '@/server/auth/guest-cookies';
import {
  cancelGuestBooking,
  isBookingPhone,
  rescheduleGuestBooking,
  resendBookingLink,
  revokeGuestLinks,
  withinGuestLimits,
} from '@/server/services/booking-service';
import { kickNotificationWorker } from '@/server/services/notification-service';
import { settleCancellation, startPayment } from '@/server/services/payment-service';
import type { ActionResult } from '@/types/action-result';

// /reservasi/cari and the manage page's "Cabut tautan" (Task P3.3.02, P3.3.03; docs/Security.md §4.4, §6.7).

// GUEST-01, BOOK-15: the lookup only ever sends a link again, to the contact on file; it never shows anything. The
// answer is the same ok(null), no sooner than LOOKUP_MIN_RESPONSE_MS, whether the code exists, the contact matches,
// the daily cap was reached or the message is on its way.
export async function lookupBookingAction(input: unknown): Promise<ActionResult<null>> {
  const startedAt = Date.now();
  const parsed = lookupBookingSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const clientIp = clientIpFrom(await headers());

  try {
    if (!(await withinGuestLimits([{ name: 'lookup:ip', subject: rateLimitIpBucket(clientIp) }]))) {
      return fail('RATE_LIMITED');
    }
    const isHuman = await verifyTurnstile(
      parsed.data.turnstileToken,
      clientIp,
      TURNSTILE_ACTIONS.bookingLookup,
    );
    if (!isHuman) return fail('VALIDATION', undefined, copy.booking.otp.captchaFailed);
    const resent = await resendBookingLink(parsed.data);
    if (resent === 'queued') after(kickNotificationWorker);
  } catch (error) {
    return mapError(error);
  }
  await waitUntilElapsed(startedAt, LOOKUP_MIN_RESPONSE_MS);
  return ok(null);
}

const revokeSchema = z.object({ bookingCode: z.string().regex(BOOKING_CODE_PATTERN) }).strict();

// Every link of the booking stops working, the one in this browser included; a new one comes through /reservasi/cari.
export async function revokeGuestLinksAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'manage');
  if (!guard.ok) return guard;

  try {
    const { bookingId, bookingCode } = guard.guest;
    if (!(await withinGuestLimits([{ name: 'link_revoke:booking', subject: bookingId }]))) {
      return fail('RATE_LIMITED');
    }
    await revokeGuestLinks(bookingId);
    const jar = await cookies();
    for (const name of guestLinkCookieNames(bookingCode)) {
      jar.delete({ name, path: `${GUEST_BOOKING_PATH}/${bookingCode}` });
    }
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// ===== The status hub's manage actions (Task P3.12.02; docs/PRD.md §13.1 A16–A18) =====

const hubText = bookingHubCopy;
const MS_PER_SECOND = 1000;

// "Batalkan reservasi": an unpaid booking for free, a paid one under the refund terms (or, after a weather notice, the
// weather refund). The orders end and a QRIS refund is asked of Midtrans after the answer; the page reads the new
// state when it refreshes.
export async function cancelBookingAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'manage');
  if (!guard.ok) return guard;

  try {
    const { bookingId } = guard.guest;
    if (!(await withinGuestLimits([{ name: 'booking_cancel:booking', subject: bookingId }]))) {
      return fail('RATE_LIMITED');
    }
    const outcome = await cancelGuestBooking(bookingId, {
      reason: parsed.data.reason ?? hubText.cancel.defaultReason,
      kind: parsed.data.kind,
    });
    after(() => settleCancellation(outcome));
    after(kickNotificationWorker);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// "Pindah jadwal" after a weather notice: one new session per leg, checked and moved by the database.
export async function rescheduleBookingAction(
  input: unknown,
): Promise<ActionResult<{ visitDate: string }>> {
  const parsed = rescheduleBookingSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'manage');
  if (!guard.ok) return guard;

  try {
    const { bookingId } = guard.guest;
    if (!(await withinGuestLimits([{ name: 'booking_reschedule:booking', subject: bookingId }]))) {
      return fail('RATE_LIMITED');
    }
    const moved = await rescheduleGuestBooking(bookingId, parsed.data.sessionIds);
    return ok({ visitDate: moved.visitDate });
  } catch (error) {
    return mapError(error);
  }
}

// "Konfirmasi & Bayar" of a quotation (docs/PRD.md §9.2 quoted → pending_payment): the visitor proves the booking's
// own WhatsApp number again with a code, then the first attempt reserves the seats and opens the Snap page.
export async function confirmQuotationAction(
  input: unknown,
): Promise<ActionResult<{ redirectUrl: string }>> {
  const parsed = confirmQuotationSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'manage');
  if (!guard.ok) return guard;

  try {
    const { bookingId } = guard.guest;
    if (!(await withinGuestLimits([{ name: 'quotation_confirm:booking', subject: bookingId }]))) {
      return fail('RATE_LIMITED');
    }
    const proof = await readPhoneProofCookie();
    const isFreshProof =
      proof?.channel === 'whatsapp' &&
      Date.now() / MS_PER_SECOND - (proof.expiresAt - PHONE_PROOF_TTL_SECONDS) <=
        PHONE_PROOF_FRESH_SECONDS;
    if (!isFreshProof || !(await isBookingPhone(bookingId, proof.phone))) {
      return fail('VALIDATION', undefined, hubText.quoted.wrongPhone);
    }
    return ok(await startPayment(bookingId));
  } catch (error) {
    return mapError(error);
  }
}
