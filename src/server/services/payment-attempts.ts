import 'server-only';

import {
  svcAttachSnapToken,
  svcCloseAttemptForCash,
  svcCloseAttemptForTransfer,
  svcRecordPaymentFailure,
  type PaymentAttempt,
} from '@/db/rpc-payments';
import type { DatabaseClient } from '@/db/rpc-result';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import {
  createSnapTransaction,
  expireTransaction,
  getTransactionStatus,
} from '@/lib/midtrans/client';
import { buildSnapPayload } from '@/lib/midtrans/snap';
import { publicEnv } from '@/lib/public-env';
import { openAttemptOf, type PreparedSnapBooking } from '@/server/services/payment-reads';
import type { OpenPaymentAttempt } from '@/types/payment';

// The attempts behind a booking's Snap page (Task P3.7.04; docs/Security.md §3.2, WH-16), on the service-role client
// payment-service.ts hands in: whether an open page can be reused, ending an attempt that cannot, and opening the next.

const text = copy.booking.payment;
const MS_PER_MINUTE = 60_000;
const MIN_HOLD_LEFT_MINUTES = 5;
const MIN_HOLD_LEFT_MS = MIN_HOLD_LEFT_MINUTES * MS_PER_MINUTE;
// An attempt this young without its Snap page is another request still asking Midtrans for one.
const SNAP_REQUEST_GRACE_MS = 20_000;
const PAID_STATUSES: ReadonlySet<string> = new Set(['settlement', 'capture']);

// Delta review of PR #91, M-A: a page lives at most 24 hours (payments.expiry_time), so a pending page past its expiry
// is no longer reused but replaced.
function hasPageLapsed(open: OpenPaymentAttempt, now: number): boolean {
  return open.pageExpiresAt !== null && Date.parse(open.pageExpiresAt) <= now;
}

export function isReusablePage(
  open: OpenPaymentAttempt | null,
): open is OpenPaymentAttempt & { redirectUrl: string } {
  return (
    open?.status === 'pending' && open.redirectUrl !== null && !hasPageLapsed(open, Date.now())
  );
}

// An attempt left without its Snap page, or whose page lapsed, is ended at Midtrans before another replaces it (a
// lapsed page Midtrans no longer knows answers 404, not_charged); an attempt under review blocks a new one.
export async function endAbandonedAttempt(open: OpenPaymentAttempt | null): Promise<string | null> {
  if (open === null) return null;
  if (open.status === 'needs_review') throw new AppError('STATE_INVALID', text.underReview);
  const now = Date.now();
  const isLapsedPage = open.status === 'pending' && hasPageLapsed(open, now);
  if (open.status !== 'initiated' && !isLapsedPage) throw new AppError('STATE_INVALID');
  if (!isLapsedPage && now - Date.parse(open.createdAt) < SNAP_REQUEST_GRACE_MS) {
    throw new AppError('CONFLICT', text.errors.preparing);
  }
  if ((await expireTransaction(open.orderId)) === 'refused') throw new AppError('PAYMENT');
  return open.paymentId;
}

// BOOK-14: no new page with less than five minutes of the hold left. A quoted booking has no deadline yet; it gets one
// with its first attempt (create_payment_attempt), which checks the same.
export function checkTimeLeft(prepared: PreparedSnapBooking): void {
  const expiresAt = prepared.booking.expiresAt;
  if (expiresAt !== null && Date.parse(expiresAt) - Date.now() < MIN_HOLD_LEFT_MS) {
    throw new AppError('STATE_INVALID', text.errors.tooLate);
  }
}

// The attempt closes when Midtrans makes no page for it, so the visitor's next try starts a new one.
export async function openSnapPage(
  adminClient: DatabaseClient,
  prepared: PreparedSnapBooking,
  attempt: PaymentAttempt,
): Promise<{ redirectUrl: string }> {
  try {
    const payload = buildSnapPayload(
      { ...prepared.booking, orderId: attempt.orderId, expiresAt: attempt.expiresAt },
      prepared.addons,
      { siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL, now: new Date() },
    );
    const page = await createSnapTransaction(payload);
    await svcAttachSnapToken(adminClient, {
      paymentId: attempt.paymentId,
      snapToken: page.token,
      redirectUrl: page.redirectUrl,
    });
    return { redirectUrl: page.redirectUrl };
  } catch {
    await svcRecordPaymentFailure(adminClient, attempt.paymentId, 'failed');
    throw new AppError('PAYMENT');
  }
}

// Review of PR #91, L1, and its delta review, L-1: once the action found the booking able to take cash, an open
// Midtrans order of it is ended at Midtrans and closed as expired with the officer as actor, so the PIC cannot pay it
// too. An order Midtrans says was paid stops the cash, and mark_booking_paid_manually still refuses while any payment
// is open or settled.
// The same before a manual transfer applies (review of PR #102, L3).
interface EndedOrder {
  paymentId: string;
  isPageMaybeLive: boolean;
}

async function endOpenOrder(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<EndedOrder | null> {
  const open = await openAttemptOf(adminClient, bookingId);
  if (open === null) return null;
  if (open.status === 'needs_review') throw new AppError('STATE_INVALID', text.underReview);
  const outcome = await expireTransaction(open.orderId);
  if (outcome === 'refused') throw new AppError('PAYMENT');
  const status = await getTransactionStatus(open.orderId);
  if (PAID_STATUSES.has(status.transaction_status ?? '')) throw new AppError('STATE_INVALID');
  return {
    paymentId: open.paymentId,
    isPageMaybeLive: outcome === 'not_charged' && open.redirectUrl !== null,
  };
}

export async function closeOpenOrderForCash(
  adminClient: DatabaseClient,
  bookingId: string,
  actorId: string,
): Promise<void> {
  const ended = await endOpenOrder(adminClient, bookingId);
  if (ended) await svcCloseAttemptForCash(adminClient, { ...ended, actorId });
}

export async function closeOpenOrderForTransfer(
  adminClient: DatabaseClient,
  bookingId: string,
  actorId: string,
): Promise<void> {
  const ended = await endOpenOrder(adminClient, bookingId);
  if (ended) await svcCloseAttemptForTransfer(adminClient, ended.paymentId, actorId);
}
