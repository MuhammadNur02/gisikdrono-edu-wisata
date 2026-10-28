import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The nightly reconciliation (Task P3.9.03, 20261105090000), on the service-role client of
// api/jobs/reconcile-payments.

export type ReconciliationWindow = 'open' | 'paid';

export interface OrderToReconcile {
  orderId: string;
  // open: an attempt of the last 72 h still waiting for Midtrans; paid: a payment settled in the last 7 days.
  reason: ReconciliationWindow;
}

const orderRowsSchema = z.array(
  z.object({ order_id: z.string(), reason: z.enum(['open', 'paid']) }).strict(),
);

export async function svcPaymentsToReconcile(
  adminClient: DatabaseClient,
  limit: number,
): Promise<OrderToReconcile[]> {
  const rows = orderRowsSchema.parse(
    await resultOf(adminClient.rpc('svc_payments_to_reconcile', { p_limit: limit })),
  );
  return rows.map((row) => ({ orderId: row.order_id, reason: row.reason }));
}

// What the Status API said of one order: an answer stored as the poll event eventId, Midtrans' 404, or no answer.
export type OrderLookOutcome =
  | { orderId: string; outcome: 'answered'; eventId: number }
  | { orderId: string; outcome: 'not_found' }
  | { orderId: string; outcome: 'unanswered' };

const paymentsReportSchema = z
  .object({
    run_id: z.uuid(),
    payments_checked: z.int().nonnegative(),
    orders_unanswered: z.int().nonnegative(),
    orders_waiting: z.int().nonnegative(),
    issues_found: z.int().nonnegative(),
    issues_already_open: z.int().nonnegative(),
  })
  .strict();

export interface PaymentsReconciled {
  reconciliationRunId: string;
  paymentsChecked: number;
  // Orders whose ask went unanswered: the run fails, and the next one asks again.
  ordersUnanswered: number;
  // Orders of either window this run did not reach: their turn comes on a later night.
  ordersWaiting: number;
  issuesFound: number;
  issuesAlreadyOpen: number;
}

function lookRowOf(look: OrderLookOutcome) {
  return look.outcome === 'answered'
    ? { order_id: look.orderId, outcome: look.outcome, event_id: look.eventId }
    : { order_id: look.orderId, outcome: look.outcome };
}

export async function svcReconcilePayments(
  adminClient: DatabaseClient,
  looks: readonly OrderLookOutcome[],
): Promise<PaymentsReconciled> {
  const report = paymentsReportSchema.parse(
    await resultOf(
      adminClient.rpc('svc_reconcile_payments', { p_looks: looks.map((look) => lookRowOf(look)) }),
    ),
  );
  return {
    reconciliationRunId: report.run_id,
    paymentsChecked: report.payments_checked,
    ordersUnanswered: report.orders_unanswered,
    ordersWaiting: report.orders_waiting,
    issuesFound: report.issues_found,
    issuesAlreadyOpen: report.issues_already_open,
  };
}

const chainsReportSchema = z
  .object({
    ledger_chain_ok: z.boolean(),
    audit_chain_ok: z.boolean(),
    issues_found: z.int().nonnegative(),
    issues_already_open: z.int().nonnegative(),
  })
  .strict();

export interface ChainsReconciled {
  ledgerChainOk: boolean;
  auditChainOk: boolean;
  issuesFound: number;
  issuesAlreadyOpen: number;
}

// The run's second step: both hash chains walked and kept on the run.
export async function svcReconcileChains(
  adminClient: DatabaseClient,
  reconciliationRunId: string,
): Promise<ChainsReconciled> {
  const report = chainsReportSchema.parse(
    await resultOf(adminClient.rpc('svc_reconcile_chains', { p_run_id: reconciliationRunId })),
  );
  return {
    ledgerChainOk: report.ledger_chain_ok,
    auditChainOk: report.audit_chain_ok,
    issuesFound: report.issues_found,
    issuesAlreadyOpen: report.issues_already_open,
  };
}
