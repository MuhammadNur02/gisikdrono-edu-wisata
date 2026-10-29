import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  svcPaymentsToReconcile,
  svcReconcileChains,
  svcReconcilePayments,
} from '@/db/rpc-reconciliation';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const REPLY = {
  run_id: '00000000-0000-4000-8000-00000000a001',
  payments_checked: 2,
  orders_unanswered: 0,
  orders_waiting: 5,
  issues_found: 1,
  issues_already_open: 3,
};

describe('svcPaymentsToReconcile', () => {
  it('lists the orders of both windows', async () => {
    const { client, requests } = clientAnswering(200, [
      { order_id: 'GSK-7F3K9Q2M-01', reason: 'open' },
      { order_id: 'GSK-7F3K9Q2N-01', reason: 'paid' },
    ]);
    await expect(svcPaymentsToReconcile(client, 100)).resolves.toEqual([
      { orderId: 'GSK-7F3K9Q2M-01', reason: 'open' },
      { orderId: 'GSK-7F3K9Q2N-01', reason: 'paid' },
    ]);
    expect(requests[0]?.url).toBe('http://supabase.test/rest/v1/rpc/svc_payments_to_reconcile');
    expect(requests[0]?.body).toEqual({ p_limit: 100 });
  });

  it('refuses a window it does not know', async () => {
    const { client } = clientAnswering(200, [{ order_id: 'GSK-7F3K9Q2M-01', reason: 'other' }]);
    await expect(svcPaymentsToReconcile(client, 100)).rejects.toBeInstanceOf(ZodError);
  });
});

describe('svcReconcilePayments', () => {
  it('sends each look, the event id only with an answer, and reads the run', async () => {
    const { client, requests } = clientAnswering(200, REPLY);
    await expect(
      svcReconcilePayments(client, [
        { orderId: 'GSK-7F3K9Q2M-01', outcome: 'answered', eventId: 11 },
        { orderId: 'GSK-7F3K9Q2N-01', outcome: 'not_found' },
        { orderId: 'GSK-7F3K9Q2P-01', outcome: 'unanswered' },
      ]),
    ).resolves.toEqual({
      reconciliationRunId: REPLY.run_id,
      paymentsChecked: 2,
      ordersUnanswered: 0,
      ordersWaiting: 5,
      issuesFound: 1,
      issuesAlreadyOpen: 3,
    });
    expect(requests[0]?.url).toBe('http://supabase.test/rest/v1/rpc/svc_reconcile_payments');
    expect(requests[0]?.body).toEqual({
      p_looks: [
        { order_id: 'GSK-7F3K9Q2M-01', outcome: 'answered', event_id: 11 },
        { order_id: 'GSK-7F3K9Q2N-01', outcome: 'not_found' },
        { order_id: 'GSK-7F3K9Q2P-01', outcome: 'unanswered' },
      ],
    });
  });

  it('refuses a report of another shape', async () => {
    const { client } = clientAnswering(200, { ...REPLY, issues_found: -1 });
    await expect(svcReconcilePayments(client, [])).rejects.toBeInstanceOf(ZodError);
  });
});

describe('svcReconcileChains', () => {
  it('walks the chains of the run and reads their verdicts', async () => {
    const { client, requests } = clientAnswering(200, {
      ledger_chain_ok: true,
      audit_chain_ok: false,
      issues_found: 1,
      issues_already_open: 0,
    });
    await expect(svcReconcileChains(client, REPLY.run_id)).resolves.toEqual({
      ledgerChainOk: true,
      auditChainOk: false,
      issuesFound: 1,
      issuesAlreadyOpen: 0,
    });
    expect(requests[0]?.url).toBe('http://supabase.test/rest/v1/rpc/svc_reconcile_chains');
    expect(requests[0]?.body).toEqual({ p_run_id: REPLY.run_id });
  });

  it('refuses a report of another shape', async () => {
    const { client } = clientAnswering(200, { ledger_chain_ok: true });
    await expect(svcReconcileChains(client, REPLY.run_id)).rejects.toBeInstanceOf(ZodError);
  });
});
