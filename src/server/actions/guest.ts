'use server';

import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { GUEST_BOOKING_PATH, LOOKUP_MIN_RESPONSE_MS } from '@/config/guest';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { guestLinkCookieName } from '@/lib/links/token';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';
import { waitUntilElapsed } from '@/lib/utils/timing';
import { lookupBookingSchema } from '@/lib/validations/guest';
import { requireGuestToken } from '@/server/auth/guards';
import {
  resendBookingLink,
  revokeGuestLinks,
  withinGuestLimits,
} from '@/server/services/booking-service';
import { kickNotificationWorker } from '@/server/services/notification-service';
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
    (await cookies()).delete({
      name: guestLinkCookieName(bookingCode),
      path: `${GUEST_BOOKING_PATH}/${bookingCode}`,
    });
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
