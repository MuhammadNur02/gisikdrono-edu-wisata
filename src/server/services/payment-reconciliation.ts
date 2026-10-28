import 'server-only';

import {
  svcPaymentsToReconcile,
  svcReconcilePayments,
  type OrderLookOutcome,
  type OrderToReconcile,
  type ReconciliationReport,
} from '@/db/rpc-reconciliation';
import type { DatabaseClient } from '@/db/rpc-result';
import { lookAtOrder } from '@/server/services/payment-poll';

// Task P3.9.03 (docs/Security.md §3.7; REC-01, REC-05, AUD-03, PAY-14): what POST /api/jobs/reconcile-payments does
// each night with the service-role client it is handed. The open attempts of the last 72 h and the payments settled in
// the last 7 days are asked of the Status API one by one, each answer stored and applied exactly as the payments poll
// applies its own (lookAtOrder), and what was seen goes to internal.reconcile_payments, which checks the answers
// against the payments, runs the invariants and the chains, and writes the run, its issues and the digest alert.

// The route's maxDuration is 60 s: at most this many orders, asked within this budget, leaving room for the run.
const RECONCILE_BATCH_SIZE = 100;
const LOOK_BUDGET_MS = 40_000;

async function lookAt(adminClient: DatabaseClient, orderId: string): Promise<OrderLookOutcome> {
  try {
    const look = await lookAtOrder(adminClient, orderId);
    return look.eventId === null
      ? { orderId, outcome: 'not_found' }
      : { orderId, outcome: 'answered', eventId: look.eventId };
  } catch {
    // Midtrans or the database out of reach for this order: the run counts it as not checked and fails, and the
    // next run asks again.
    return { orderId, outcome: 'unanswered' };
  }
}

async function lookAtOrders(
  adminClient: DatabaseClient,
  orders: readonly OrderToReconcile[],
  deadline: number,
): Promise<OrderLookOutcome[]> {
  const looks: OrderLookOutcome[] = [];
  for (const order of orders) {
    // An order the budget leaves unasked is counted as not checked by the database.
    if (Date.now() > deadline) break;
    looks.push(await lookAt(adminClient, order.orderId));
  }
  return looks;
}

export async function reconcilePayments(
  adminClient: DatabaseClient,
): Promise<ReconciliationReport> {
  const deadline = Date.now() + LOOK_BUDGET_MS;
  const orders = await svcPaymentsToReconcile(adminClient, RECONCILE_BATCH_SIZE);
  const looks = await lookAtOrders(adminClient, orders, deadline);
  return svcReconcilePayments(adminClient, looks);
}
