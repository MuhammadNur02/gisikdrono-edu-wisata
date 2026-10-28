import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcPaymentsToReconcile, svcReconcilePayments } from '@/db/rpc-reconciliation';
import type { DatabaseClient } from '@/db/rpc-result';
import { lookAtOrder } from '@/server/services/payment-poll';
import { reconcilePayments } from '@/server/services/payment-reconciliation';

vi.mock('@/db/rpc-reconciliation', () => ({
  svcPaymentsToReconcile: vi.fn(),
  svcReconcilePayments: vi.fn(),
}));
vi.mock('@/server/services/payment-poll', () => ({ lookAtOrder: vi.fn() }));

// The run is handed its client by the job route; these calls never reach it, since every RPC is a mock.
const adminClient = {} as DatabaseClient;
const REPORT = {
  reconciliationRunId: '00000000-0000-4000-8000-00000000a001',
  paymentsChecked: 3,
  ordersNotChecked: 1,
  issuesFound: 0,
  issuesAlreadyOpen: 0,
  ledgerChainOk: true,
  auditChainOk: true,
};

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
  vi.mocked(svcReconcilePayments).mockResolvedValue(REPORT);
});

describe('reconcilePayments', () => {
  it('asks Midtrans about each listed order and hands every outcome to the run', async () => {
    await expect(reconcilePayments(adminClient)).resolves.toEqual(REPORT);
    expect(svcPaymentsToReconcile).toHaveBeenCalledWith(adminClient, 100);
    expect(lookAtOrder).toHaveBeenCalledTimes(3);
    expect(svcReconcilePayments).toHaveBeenCalledWith(adminClient, [
      { orderId: 'GSK-7F3K9Q2M-01', outcome: 'answered', eventId: 11 },
      { orderId: 'GSK-7F3K9Q2N-01', outcome: 'not_found' },
      { orderId: 'GSK-7F3K9Q2P-01', outcome: 'unanswered' },
    ]);
  });

  it('stops asking once the budget is spent, leaving the rest to the database to count', async () => {
    vi.useFakeTimers();
    vi.mocked(lookAtOrder).mockReset();
    vi.mocked(lookAtOrder).mockImplementation(() => {
      vi.advanceTimersByTime(41_000);
      return Promise.resolve({ eventId: 12, isBooked: false });
    });
    await reconcilePayments(adminClient);
    expect(lookAtOrder).toHaveBeenCalledTimes(1);
    expect(svcReconcilePayments).toHaveBeenCalledWith(adminClient, [
      { orderId: 'GSK-7F3K9Q2M-01', outcome: 'answered', eventId: 12 },
    ]);
  });

  it('records the run even when nothing is waiting for Midtrans', async () => {
    vi.mocked(svcPaymentsToReconcile).mockResolvedValue([]);
    await reconcilePayments(adminClient);
    expect(lookAtOrder).not.toHaveBeenCalled();
    expect(svcReconcilePayments).toHaveBeenCalledWith(adminClient, []);
  });
});
