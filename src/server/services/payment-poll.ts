import 'server-only';

import { createHash } from 'node:crypto';

import {
  svcApplyPaymentEvent,
  svcCompletePaidOrder,
  svcPaymentsHousekeeping,
  svcPaymentsToPoll,
  svcRecordPaymentEvent,
  type OrderToPoll,
} from '@/db/rpc-payments';
import type { DatabaseClient } from '@/db/rpc-result';
import {
  svcClaimRefundRetry,
  svcMarkRefundRequest,
  svcRefundRequestsToRetry,
  svcSettleLapsedWeatherLinks,
  type RefundToRetry,
} from '@/db/rpc-terms';
import { serverEnv } from '@/lib/env';
import {
  expireTransaction,
  getTransactionStatus,
  requestRefund,
  type RefundOutcome,
} from '@/lib/midtrans/client';
import { jsonValueSchema } from '@/lib/validations/json-value';

// Task P3.9.02 (docs/Security.md §3.7; WH-13, MON-04, EP-02): what POST /api/jobs/payments-poll does every five
// minutes with the service-role client it is handed. Each open order internal.payments_to_poll lists is asked of the
// Status API, the answer is stored as a payment_events row of its own (source poll) and applied by
// internal.apply_payment_event, which takes the body as its own confirmation; an answer seen before is the same event
// and changes nothing. A paid booking that lacks a ticket or its ledger is completed by internal.complete_paid_order
// (Task P3.10.04). Then the weather windows that closed (decision of 2026-10-25), the QRIS refunds no answer came for
// (review of PR #69, H1, M1), and the housekeeping: tickets
// left on unpaid bookings, payment reminders.

const POLL_BATCH_SIZE = 20;
const REFUND_BATCH_SIZE = 10;
const WEATHER_BATCH_SIZE = 20;
// maxDuration of the route is 60 s; the run stops asking with room left to report.
const POLL_BUDGET_MS = 40_000;
const STATUS_TIMEOUT_MS = 5_000;
const UNKNOWN_ORDER_CODE = '404';
const CANCELLATION_REFUND_REASON = 'Pembatalan kunjungan sesuai syarat kunjungan';

export interface PollReport {
  asked: number;
  applied: number;
  failed: number;
  suspended: number;
  reminded: number;
  refundsRetried: number;
  weatherRefunded: number;
  weatherHeld: number;
}

function eventHashOf(body: string): string {
  return createHash('sha256').update(`poll\n${body}`).digest('hex');
}

// A settlement the poll applied closes the booking's other attempts; their orders end at Midtrans as well.
async function expireOrders(orderIds: readonly string[]): Promise<void> {
  await Promise.allSettled(orderIds.map((orderId) => expireTransaction(orderId)));
}

// What Midtrans says of one order now, stored and applied as a poll event; true when it changed something (a
// settlement, or a refund the order's refund request is booked by).
export async function applyCurrentStatus(
  adminClient: DatabaseClient,
  orderId: string,
): Promise<boolean> {
  const keyId = serverEnv.QR_SIGNING_ACTIVE_KID;
  const answer = await getTransactionStatus(orderId, STATUS_TIMEOUT_MS);
  // Midtrans has no transaction for a Snap page nobody chose a method on: nothing to apply yet.
  if (answer.status_code === UNKNOWN_ORDER_CODE) return false;
  const payload = jsonValueSchema.parse(answer);
  const event = await svcRecordPaymentEvent(adminClient, {
    source: 'poll',
    eventHash: eventHashOf(JSON.stringify(payload)),
    payload,
  });
  if (event.isProcessed) return false;
  const outcome = await svcApplyPaymentEvent(adminClient, {
    eventId: event.eventId,
    source: 'poll',
    confirmed: null,
    keyId,
  });
  await expireOrders(outcome.closeOrders);
  return outcome.result === 'applied';
}

async function pollOrder(adminClient: DatabaseClient, order: OrderToPoll): Promise<boolean> {
  // Settled with Midtrans' confirmation already stored: asking again could return the very event that paid it.
  if (order.reason === 'paid_incomplete') {
    const keyId = serverEnv.QR_SIGNING_ACTIVE_KID;
    return svcCompletePaidOrder(adminClient, { orderId: order.orderId, keyId });
  }
  return applyCurrentStatus(adminClient, order.orderId);
}

const REQUEST_STATUS_OF = {
  accepted: 'submitted',
  refused: 'failed',
  unknown: 'requested',
} as const satisfies Record<RefundOutcome, string>;

// docs/PRD.md §13.1 A16: one call to Midtrans' refund API for a QRIS refund request, reported to the database. Only
// an explicit refusal marks it failed for the superadmin; with no answer the request stays requested and the Status
// API is asked at once whether the refund went through anyway (review of PR #69, M1).
export async function askMidtransForRefund(
  adminClient: DatabaseClient,
  refund: Pick<RefundToRetry, 'requestId' | 'orderId' | 'refundKey' | 'amount'>,
): Promise<RefundOutcome> {
  const answer = await requestRefund({
    orderId: refund.orderId,
    refundKey: refund.refundKey,
    amount: refund.amount,
    reason: CANCELLATION_REFUND_REASON,
  });
  await svcMarkRefundRequest(adminClient, {
    requestId: refund.requestId,
    status: REQUEST_STATUS_OF[answer.outcome],
    statusCode: answer.statusCode,
    reason: answer.outcome === 'refused' ? 'midtrans_refused' : null,
  });
  if (answer.outcome === 'unknown')
    await applyCurrentStatus(adminClient, refund.orderId).catch(() => false);
  return answer.outcome;
}

// A request Midtrans took but whose refund notification never came is only asked of the Status API; one no answer
// came for is asked of the refund API again, with the same refund_key, unless the Status API shows it done.
async function retryRefund(adminClient: DatabaseClient, refund: RefundToRetry): Promise<void> {
  const isBooked = await applyCurrentStatus(adminClient, refund.orderId).catch(() => false);
  if (isBooked) return;
  if (refund.status === 'submitted') {
    await svcMarkRefundRequest(adminClient, {
      requestId: refund.requestId,
      status: 'submitted',
      statusCode: null,
      reason: null,
    });
    return;
  }
  // A superadmin's transfer may have recorded it meanwhile (final review of PR #69, M-1).
  if (!(await svcClaimRefundRetry(adminClient, refund.requestId))) return;
  await askMidtransForRefund(adminClient, refund);
}

async function retryRefunds(adminClient: DatabaseClient, deadline: number): Promise<number> {
  const refunds = await svcRefundRequestsToRetry(adminClient, REFUND_BATCH_SIZE);
  let retried = 0;
  for (const refund of refunds) {
    if (Date.now() > deadline) break;
    try {
      await retryRefund(adminClient, refund);
      retried += 1;
    } catch {
      // Midtrans or the database out of reach for this refund; the next run asks again.
    }
  }
  return retried;
}

async function pollOrders(adminClient: DatabaseClient, startedAt: number) {
  const orders = await svcPaymentsToPoll(adminClient, POLL_BATCH_SIZE);
  const report = { asked: 0, applied: 0, failed: 0 };
  for (const order of orders) {
    if (Date.now() - startedAt > POLL_BUDGET_MS) break;
    report.asked += 1;
    try {
      if (await pollOrder(adminClient, order)) report.applied += 1;
    } catch {
      // Midtrans or the database out of reach for this order; the next run asks again.
      report.failed += 1;
    }
  }
  return report;
}

// Each step of the run stands alone (review of PR #69, L-3): one that fails is counted and the next still runs.
async function step<T>(
  run: () => Promise<T>,
  fallback: T,
  failures: { count: number },
): Promise<T> {
  try {
    return await run();
  } catch {
    failures.count += 1;
    return fallback;
  }
}

const NO_WEATHER = { auto_refunded: 0, kept: 0, cancelled: 0, held: 0 };
const NO_ORDERS = { asked: 0, applied: 0, failed: 0 };
const NO_HOUSEKEEPING = { suspended: 0, reminded: 0 };

export async function pollPayments(adminClient: DatabaseClient): Promise<PollReport> {
  const startedAt = Date.now();
  const failures = { count: 0 };
  const orders = await step(() => pollOrders(adminClient, startedAt), NO_ORDERS, failures);
  // Decision of 2026-10-25 on the weather, rule 2: closed windows first, so a weather refund they request is retried
  // with the others below once its ten minutes have passed.
  const weather = await step(
    () => svcSettleLapsedWeatherLinks(adminClient, WEATHER_BATCH_SIZE),
    NO_WEATHER,
    failures,
  );
  const refundsRetried = await step(
    () => retryRefunds(adminClient, startedAt + POLL_BUDGET_MS),
    0,
    failures,
  );
  const housekeeping = await step(
    () => svcPaymentsHousekeeping(adminClient),
    NO_HOUSEKEEPING,
    failures,
  );
  return {
    ...orders,
    failed: orders.failed + failures.count,
    refundsRetried,
    weatherRefunded: weather.auto_refunded,
    weatherHeld: weather.held,
    ...housekeeping,
  };
}
