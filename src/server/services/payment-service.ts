import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

import {
  svcApplyPaymentEvent,
  svcAttachSnapToken,
  svcCreatePaymentAttempt,
  svcRecordPaymentEvent,
  svcRecordPaymentFailure,
  svcRecordWebhookRejection,
  type PaymentAttempt,
  type PaymentEventOutcome,
  type WebhookRejection,
} from '@/db/rpc-payments';
import type { DatabaseClient } from '@/db/rpc-result';
import { svcMarkRefundRequest, type CancellationOutcome } from '@/db/rpc-terms';
import { copy } from '@/lib/copy/id';
import { serverEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { isSameAmount } from '@/lib/midtrans/amount';
import {
  createSnapTransaction,
  expireTransaction,
  getTransactionStatus,
  requestRefund,
  WEBHOOK_STATUS_TIMEOUT_MS,
} from '@/lib/midtrans/client';
import { mapMidtransStatus, needsStatusConfirmation } from '@/lib/midtrans/map-status';
import type { MidtransNotification } from '@/lib/midtrans/schemas';
import { buildSnapPayload } from '@/lib/midtrans/snap';
import { publicEnv } from '@/lib/public-env';
import { withinRateLimits, type RateLimitCheck } from '@/lib/rate-limit';
// Visitors have no session and Midtrans is no user, so payments run with the service role (CLAUDE.md §6.1). Every
// call is keyed by what the server checked first: a booking id a verified guest link gave (startPayment, the page), or
// an order id inside a notification whose signature passed (the webhook). Status and money columns are written only by
// the internal.* functions behind the svc_* wrappers.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { jsonValueSchema } from '@/lib/validations/json-value';
import {
  openAttemptOf,
  paymentPageOf,
  snapBookingOf,
  type PreparedSnapBooking,
} from '@/server/services/payment-reads';
import type { OpenPaymentAttempt, PaymentPageView } from '@/types/payment';

// Task P3.7.04 and P3.8.03–04 (docs/Security.md §3.2, §3.3): opening a booking's Snap page, and taking Midtrans'
// notifications in.

const text = copy.booking.payment;
const MS_PER_MINUTE = 60_000;
const MIN_HOLD_LEFT_MINUTES = 5;
const MIN_HOLD_LEFT_MS = MIN_HOLD_LEFT_MINUTES * MS_PER_MINUTE;
// An attempt this young without its Snap page is another request still asking Midtrans for one.
const SNAP_REQUEST_GRACE_MS = 20_000;
// What Midtrans records as the reason of a refund the visit terms gave (docs/PRD.md §13.1 A16).
const CANCELLATION_REFUND_REASON = 'Pembatalan kunjungan sesuai syarat kunjungan';

export function withinPaymentLimits(checks: readonly RateLimitCheck[]): Promise<boolean> {
  return withinRateLimits(createSupabaseAdminClient(), checks);
}

export function loadPaymentPage(bookingId: string): Promise<PaymentPageView> {
  return paymentPageOf(createSupabaseAdminClient(), bookingId);
}

// docs/Security.md §3.2 (WH-16): an attempt left without its Snap page is ended at Midtrans before another replaces
// it; an open page is reused, and an attempt under review blocks a new one.
async function endAbandonedAttempt(open: OpenPaymentAttempt | null): Promise<string | null> {
  if (open === null) return null;
  if (open.status === 'needs_review') throw new AppError('STATE_INVALID', text.underReview);
  if (open.status !== 'initiated') throw new AppError('STATE_INVALID');
  if (Date.now() - Date.parse(open.createdAt) < SNAP_REQUEST_GRACE_MS) {
    throw new AppError('CONFLICT', text.errors.preparing);
  }
  if ((await expireTransaction(open.orderId)) === 'refused') throw new AppError('PAYMENT');
  return open.paymentId;
}

// BOOK-14: no new page with less than five minutes of the hold left. A quoted booking has no deadline yet; it gets one
// with its first attempt (create_payment_attempt), which checks the same.
function checkTimeLeft(prepared: PreparedSnapBooking): void {
  const expiresAt = prepared.booking.expiresAt;
  if (expiresAt !== null && Date.parse(expiresAt) - Date.now() < MIN_HOLD_LEFT_MS) {
    throw new AppError('STATE_INVALID', text.errors.tooLate);
  }
}

// The attempt closes when Midtrans makes no page for it, so the visitor's next try starts a new one.
async function openSnapPage(
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

export async function startPayment(bookingId: string): Promise<{ redirectUrl: string }> {
  const adminClient = createSupabaseAdminClient();
  const open = await openAttemptOf(adminClient, bookingId);
  if (open?.status === 'pending' && open.redirectUrl !== null) {
    return { redirectUrl: open.redirectUrl };
  }
  const prepared = await snapBookingOf(adminClient, bookingId);
  checkTimeLeft(prepared);
  const replacesPaymentId = await endAbandonedAttempt(open);
  const attempt = await svcCreatePaymentAttempt(adminClient, { bookingId, replacesPaymentId });
  return openSnapPage(adminClient, prepared, attempt);
}

// ===== The webhook (CLAUDE.md §7.2 steps 7–10) =====

export type NotificationOutcome = PaymentEventOutcome | { result: 'duplicate_delivery' };

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Step 8 and 9: the order is looked up exactly as it came, never parsed, and its amount compared with ours. Only a
// known order with our amount is worth asking the Status API about; the database records every other case itself.
async function isConfirmable(
  adminClient: DatabaseClient,
  notification: MidtransNotification,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('payments')
    .select('gross_amount')
    .eq('order_id', notification.order_id)
    .maybeSingle();
  if (error) throw error;
  return (
    data !== null &&
    isSameAmount(notification.gross_amount, notification.currency, data.gross_amount) &&
    needsStatusConfirmation(
      mapMidtransStatus(notification.transaction_status, notification.fraud_status),
    )
  );
}

async function confirmedStatus(orderId: string) {
  return jsonValueSchema.parse(await getTransactionStatus(orderId, WEBHOOK_STATUS_TIMEOUT_MS));
}

// Steps 7 to 10. A body seen before and processed is a duplicate delivery; one whose first delivery stopped short is
// taken up again. Midtrans out of reach throws, and the webhook answers 503 so Midtrans retries (the poll of Task
// P3.9.02 catches up too). internal.apply_payment_event asks for the confirmation itself if this side and the database
// ever map a status differently.
export async function processMidtransNotification(
  notification: MidtransNotification,
  rawBody: string,
): Promise<NotificationOutcome> {
  const adminClient = createSupabaseAdminClient();
  const event = await svcRecordPaymentEvent(adminClient, {
    source: 'webhook',
    eventHash: sha256Hex(rawBody),
    payload: jsonValueSchema.parse(JSON.parse(rawBody)),
  });
  if (event.isProcessed) return { result: 'duplicate_delivery' };

  const confirmed = (await isConfirmable(adminClient, notification))
    ? await confirmedStatus(notification.order_id)
    : null;
  const keyId = serverEnv.QR_SIGNING_ACTIVE_KID;
  const outcome = await svcApplyPaymentEvent(adminClient, {
    eventId: event.eventId,
    source: 'webhook',
    confirmed,
    keyId,
  });
  if (outcome.result !== 'needs_confirmation') return outcome;
  return svcApplyPaymentEvent(adminClient, {
    eventId: event.eventId,
    source: 'webhook',
    confirmed: await confirmedStatus(notification.order_id),
    keyId,
  });
}

// A paid booking's other attempts were closed in the database; their orders end at Midtrans too, so nobody pays twice
// from an old page. Best effort, after the answer: an order that stays open is caught as a duplicate settlement.
export async function expireClosedOrders(orderIds: readonly string[]): Promise<void> {
  const log = createLogger(randomUUID());
  for (const orderId of orderIds) {
    try {
      await expireTransaction(orderId);
    } catch {
      log.warn('internal_error', { step: 'expire_closed_order', orderId });
    }
  }
}

// docs/Security.md §3.3 step 5: metadata only, never the body, and at most twenty rows an hour per IP.
export async function recordWebhookRejection(
  rejection: WebhookRejection,
  ipBucket: string,
): Promise<void> {
  const adminClient = createSupabaseAdminClient();
  const isWithinCap = await withinRateLimits(adminClient, [
    { name: 'webhook_rejection:ip', subject: ipBucket },
  ]);
  if (isWithinCap) await svcRecordWebhookRejection(adminClient, rejection);
}

// docs/PRD.md §13.1 A16 (Task P3.12.02): what a cancellation leaves for Midtrans, after its commit and best effort.
// Its open orders end; a QRIS refund is asked of Midtrans' refund API and the request marked submitted or failed. A
// Virtual Account refund waits for the treasurer's transfer and record_refund, so nothing is called for it.
export async function settleCancellation(outcome: CancellationOutcome): Promise<void> {
  await expireClosedOrders(outcome.closeOrders);
  const refund = outcome.refund;
  if (refund?.method !== 'qris') return;
  const adminClient = createSupabaseAdminClient();
  try {
    const answer = await requestRefund({
      orderId: refund.orderId,
      refundKey: refund.refundKey,
      amount: refund.amount,
      reason: CANCELLATION_REFUND_REASON,
    });
    await svcMarkRefundRequest(adminClient, {
      requestId: refund.requestId,
      status: answer.accepted ? 'submitted' : 'failed',
      statusCode: answer.statusCode,
      reason: answer.accepted ? null : 'midtrans_refused',
    });
  } catch {
    await svcMarkRefundRequest(adminClient, {
      requestId: refund.requestId,
      status: 'failed',
      statusCode: null,
      reason: 'midtrans_unreachable',
    });
  }
}
