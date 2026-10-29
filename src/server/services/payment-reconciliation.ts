import 'server-only';

import {
  svcPaymentsToReconcile,
  svcReconcileChains,
  svcReconcilePayments,
  type OrderLookOutcome,
  type OrderToReconcile,
  type PaymentsReconciled,
} from '@/db/rpc-reconciliation';
import type { DatabaseClient } from '@/db/rpc-result';
import { lookAtOrder } from '@/server/services/payment-poll';

// Task P3.9.03 (docs/Security.md §3.7; REC-01, REC-05, AUD-03, PAY-14): what POST /api/jobs/reconcile-payments does
// each night with the service-role client it is handed. The open attempts of the last 72 h and, taking turns, the
// payments settled in the last 7 days are asked of the Status API one by one, each answer stored and applied exactly
// as the payments poll applies its own (lookAtOrder); what was seen goes to internal.reconcile_payments, which checks
// the answers against the payments, runs the invariants and writes the run, its issues and the digest alert. The
// chains are walked last, in a step of their own, while the route's 60 s still leave room for them.

// At most this many orders, none asked once LOOK_BUDGET_MS has passed: a Status API call takes up to 5 s and a
// settlement's expiries are skipped past the budget, so the last look ends well inside the route's maxDuration.
const RECONCILE_BATCH_SIZE = 100;
const LOOK_BUDGET_MS = 30_000;
// Past this, the chain walk is left to the next night (the hourly anomaly scan walks them too) and the run fails.
const CHAIN_STEP_LATEST_MS = 40_000;

export interface ReconciliationReport extends PaymentsReconciled {
  // null when the chains were not walked: no time was left for them.
  ledgerChainOk: boolean | null;
  auditChainOk: boolean | null;
}

async function lookAt(
  adminClient: DatabaseClient,
  orderId: string,
  deadline: number,
): Promise<OrderLookOutcome> {
  try {
    const look = await lookAtOrder(adminClient, orderId, deadline);
    return look.eventId === null
      ? { orderId, outcome: 'not_found' }
      : { orderId, outcome: 'answered', eventId: look.eventId };
  } catch {
    // Midtrans or the database out of reach for this order: the run fails, and the next one asks again.
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
    // An order the budget leaves unasked waits for its turn on a later night.
    if (Date.now() > deadline) break;
    looks.push(await lookAt(adminClient, order.orderId, deadline));
  }
  return looks;
}

export async function reconcilePayments(
  adminClient: DatabaseClient,
): Promise<ReconciliationReport> {
  const startedAt = Date.now();
  const orders = await svcPaymentsToReconcile(adminClient, RECONCILE_BATCH_SIZE);
  const looks = await lookAtOrders(adminClient, orders, startedAt + LOOK_BUDGET_MS);
  const payments = await svcReconcilePayments(adminClient, looks);
  if (Date.now() - startedAt > CHAIN_STEP_LATEST_MS) {
    return { ...payments, ledgerChainOk: null, auditChainOk: null };
  }
  const chains = await svcReconcileChains(adminClient, payments.reconciliationRunId);
  return {
    ...payments,
    issuesFound: payments.issuesFound + chains.issuesFound,
    issuesAlreadyOpen: payments.issuesAlreadyOpen + chains.issuesAlreadyOpen,
    ledgerChainOk: chains.ledgerChainOk,
    auditChainOk: chains.auditChainOk,
  };
}
