'use server';

import { z } from 'zod';

import { fail, mapError, ok } from '@/lib/errors';
import { BOOKING_CODE_PATTERN } from '@/lib/utils/codes';
import { requireGuestToken } from '@/server/auth/guards';
import { startPayment, withinPaymentLimits } from '@/server/services/payment-service';
import type { ActionResult } from '@/types/action-result';

// "Bayar sekarang" on /reservasi/[bookingCode]/bayar (Task P3.7.04; docs/Security.md §3.2, PAY-04, PAY-09). The
// visitor sends the booking code only: the amount, the order and the page come from the database and Midtrans.

const startPaymentSchema = z
  .object({ bookingCode: z.string().regex(BOOKING_CODE_PATTERN) })
  .strict();

// The browser opens the hosted page itself with the answer: Snap lives on Midtrans' own host, and redirect() inside a
// Server Action would not reach it from a fetch (CLAUDE.md §5.2).
export async function startPaymentAction(
  input: unknown,
): Promise<ActionResult<{ redirectUrl: string }>> {
  const parsed = startPaymentSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'pay');
  if (!guard.ok) return guard;

  try {
    const { bookingId } = guard.guest;
    if (!(await withinPaymentLimits([{ name: 'payment_start:booking', subject: bookingId }]))) {
      return fail('RATE_LIMITED');
    }
    return ok(await startPayment(bookingId));
  } catch (error) {
    return mapError(error);
  }
}
