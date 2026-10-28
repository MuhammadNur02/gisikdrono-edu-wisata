import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  svcPaymentsToReconcile,
  svcReconcileChains,
  svcReconcilePayments,
} from '@/db/rpc-reconciliation';
import type { DatabaseClient } from '@/db/rpc-result';
import { lookAtOrder } from '@/server/services/payment-poll';
import { reconcilePayments } from '@/server/services/payment-reconciliation';

vi.mock('@/db/rpc-reconciliation', () => ({
  svcPaymentsToReconcile: vi.fn(),
  svcReconcileChains: vi.fn(),
  svcReconcilePayments: vi.fn(),
}));
vi.mock('@/server/services/payment-poll', () => ({ lookAtOrder: vi.fn() }));

// The run is handed its client by the job route; these calls never reach it, since every RPC is a mock.
const adminClient = {} as DatabaseClient;
const PAYMENTS = {
  reconciliationRunId: '00000000-0000-4000-8000-00000000a001',
  paymentsChecked: 2,
  ordersUnanswered: 1,
  ordersWaiting: 4,
  issuesFound: 2,
  issuesAlreadyOpen: 1,
};
const CHAINS = { ledgerChainOk: true, auditChainOk: false, issuesFound: 1, issuesAlreadyOpen: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(svcPaymentsToReconcile).mockResolvedValue([
    { orderId: 'GSK-7F3K9Q2M-01', reason: 'open' },
    { orderId: 'GSK-7F3K9Q2N-01', reason: 'paid' },
    { orderId: 'GSK-7F3K9Q2P-01', reason: 'paid' },
  ]);
  vi.mocked(lookAtOrder)
    .mockResolvedValueOnce({ eventId: 11, isBooked: true })
    .mockResolvedValueOnce({ eventId: null, isBooked: false })
    .mockRejectedValueOnce(new Error('Midtrans unreachable'));
  vi.mocked(svcReconcilePayments).mockResolvedValue(PAYMENTS);
  vi.mocked(svcReconcileChains).mockResolvedValue(CHAINS);
});

describe('reconcilePayments', () => {
  it('asks about each listed order, hands every outcome to the run, then walks the chains', async () => {
    await expect(reconcilePayments(adminClient)).resolves.toEqual({
      ...PAYMENTS,
      issuesFound: 3,
      issuesAlreadyOpen: 1,
      ledgerChainOk: true,
      auditChainOk: false,
    });
    expect(svcPaymentsToReconcile).toHaveBeenCalledWith(adminClient, 100);
    expect(lookAtOrder).toHaveBeenCalledTimes(3);
    expect(lookAtOrder).toHaveBeenCalledWith(adminClient, 'GSK-7F3K9Q2M-01', expect.any(Number));
    expect(svcReconcilePayments).toHaveBeenCalledWith(adminClient, [
      { orderId: 'GSK-7F3K9Q2M-01', outcome: 'answered', eventId: 11 },
      { orderId: 'GSK-7F3K9Q2N-01', outcome: 'not_found' },
      { orderId: 'GSK-7F3K9Q2P-01', outcome: 'unanswered' },
    ]);
    expect(svcReconcileChains).toHaveBeenCalledWith(adminClient, PAYMENTS.reconciliationRunId);
  });

  it('stops asking once the budget is spent, leaving the rest waiting their turn', async () => {
    vi.useFakeTimers();
    vi.mocked(lookAtOrder).mockReset();
    vi.mocked(lookAtOrder).mockImplementation(() => {
      vi.advanceTimersByTime(31_000);
      return Promise.resolve({ eventId: 12, isBooked: false });
    });
    await reconcilePayments(adminClient);
    expect(lookAtOrder).toHaveBeenCalledTimes(1);
    expect(svcReconcilePayments).toHaveBeenCalledWith(adminClient, [
      { orderId: 'GSK-7F3K9Q2M-01', outcome: 'answered', eventId: 12 },
    ]);
    expect(svcReconcileChains).toHaveBeenCalled();
  });

  it('leaves the chains unwalked when too little time is left', async () => {
    vi.useFakeTimers();
    vi.mocked(svcReconcilePayments).mockImplementation(() => {
      vi.advanceTimersByTime(41_000);
      return Promise.resolve(PAYMENTS);
    });
    await expect(reconcilePayments(adminClient)).resolves.toEqual({
      ...PAYMENTS,
      ledgerChainOk: null,
      auditChainOk: null,
    });
    expect(svcReconcileChains).not.toHaveBeenCalled();
  });

  it('records the run even when nothing is waiting for Midtrans', async () => {
    vi.mocked(svcPaymentsToReconcile).mockResolvedValue([]);
    await reconcilePayments(adminClient);
    expect(lookAtOrder).not.toHaveBeenCalled();
    expect(svcReconcilePayments).toHaveBeenCalledWith(adminClient, []);
  });
});
