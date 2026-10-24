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
import { serverEnv } from '@/lib/env';
import { expireTransaction, getTransactionStatus } from '@/lib/midtrans/client';
import { jsonValueSchema } from '@/lib/validations/json-value';

// Task P3.9.02 (docs/Security.md §3.7; WH-13, MON-04, EP-02): what POST /api/jobs/payments-poll does every five
// minutes with the service-role client it is handed. Each open order internal.payments_to_poll lists is asked of the
// Status API, the answer is stored as a payment_events row of its own (source poll) and applied by
// internal.apply_payment_event, which takes the body as its own confirmation; an answer seen before is the same event
// and changes nothing. A paid booking that lacks a ticket or its ledger is completed by internal.complete_paid_order
// (Task P3.10.04). Then the housekeeping: tickets left on unpaid bookings, payment reminders.

const POLL_BATCH_SIZE = 20;
// maxDuration of the route is 60 s; the run stops asking with room left to report.
const POLL_BUDGET_MS = 40_000;
const STATUS_TIMEOUT_MS = 5_000;
const UNKNOWN_ORDER_CODE = '404';

export interface PollReport {
  asked: number;
  applied: number;
  failed: number;
  suspended: number;
  reminded: number;
}

function eventHashOf(body: string): string {
  return createHash('sha256').update(`poll\n${body}`).digest('hex');
}

// A settlement the poll applied closes the booking's other attempts; their orders end at Midtrans as well.
async function expireOrders(orderIds: readonly string[]): Promise<void> {
  await Promise.allSettled(orderIds.map((orderId) => expireTransaction(orderId)));
}

async function pollOrder(adminClient: DatabaseClient, order: OrderToPoll): Promise<boolean> {
  const keyId = serverEnv.QR_SIGNING_ACTIVE_KID;
  // Settled with Midtrans' confirmation already stored: asking again could return the very event that paid it.
  if (order.reason === 'paid_incomplete') {
    return svcCompletePaidOrder(adminClient, { orderId: order.orderId, keyId });
  }
  const answer = await getTransactionStatus(order.orderId, STATUS_TIMEOUT_MS);
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

export async function pollPayments(adminClient: DatabaseClient): Promise<PollReport> {
  const startedAt = Date.now();
  const orders = await svcPaymentsToPoll(adminClient, POLL_BATCH_SIZE);
  const report: PollReport = { asked: 0, applied: 0, failed: 0, suspended: 0, reminded: 0 };
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
  const housekeeping = await svcPaymentsHousekeeping(adminClient);
  return { ...report, ...housekeeping };
}
