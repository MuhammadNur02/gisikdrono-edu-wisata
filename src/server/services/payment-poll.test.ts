import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  svcApplyPaymentEvent,
  svcCompletePaidOrder,
  svcPaymentsHousekeeping,
  svcPaymentsToPoll,
  svcRecordPaymentEvent,
} from '@/db/rpc-payments';
import type { DatabaseClient } from '@/db/rpc-result';
import { expireTransaction, getTransactionStatus } from '@/lib/midtrans/client';
import { pollPayments } from '@/server/services/payment-poll';

vi.mock('@/db/rpc-payments', () => ({
  svcApplyPaymentEvent: vi.fn(),
  svcCompletePaidOrder: vi.fn(),
  svcPaymentsHousekeeping: vi.fn(),
  svcPaymentsToPoll: vi.fn(),
  svcRecordPaymentEvent: vi.fn(),
}));
vi.mock('@/lib/midtrans/client', () => ({
  expireTransaction: vi.fn(),
  getTransactionStatus: vi.fn(),
}));

// The poll is handed its client by the job route; these calls never reach it, since every RPC is a mock.
const adminClient = {} as DatabaseClient;
const SETTLED = {
  status_code: '200',
  order_id: 'GSK-7F3K9Q2M-01',
  transaction_status: 'settlement',
  gross_amount: '600000.00',
};
const APPLIED = {
  result: 'applied' as const,
  processingResult: 'settled',
  paymentStatus: 'settled' as const,
  bookingStatus: 'paid' as const,
  closeOrders: ['GSK-7F3K9Q2M-02'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(svcPaymentsToPoll).mockResolvedValue([{ orderId: 'GSK-7F3K9Q2M-01', reason: 'open' }]);
  vi.mocked(getTransactionStatus).mockResolvedValue(SETTLED);
  vi.mocked(svcRecordPaymentEvent).mockResolvedValue({ eventId: 7, isProcessed: false });
  vi.mocked(svcApplyPaymentEvent).mockResolvedValue(APPLIED);
  vi.mocked(svcPaymentsHousekeeping).mockResolvedValue({ suspended: 0, reminded: 1 });
});

describe('pollPayments', () => {
  it('stores the Status API answer as a poll event and applies it as its own confirmation', async () => {
    await expect(pollPayments(adminClient)).resolves.toEqual({
      asked: 1,
      applied: 1,
      failed: 0,
      suspended: 0,
      reminded: 1,
    });
    expect(svcRecordPaymentEvent).toHaveBeenCalledWith(adminClient, {
      source: 'poll',
      eventHash: createHash('sha256')
        .update(`poll\n${JSON.stringify(SETTLED)}`)
        .digest('hex'),
      payload: SETTLED,
    });
    expect(svcApplyPaymentEvent).toHaveBeenCalledWith(adminClient, {
      eventId: 7,
      source: 'poll',
      confirmed: null,
      keyId: 'k1',
    });
    expect(expireTransaction).toHaveBeenCalledWith('GSK-7F3K9Q2M-02');
  });

  it('applies nothing for an order Midtrans never charged, or an answer seen before', async () => {
    vi.mocked(getTransactionStatus).mockResolvedValueOnce({ status_code: '404' });
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([
      { orderId: 'GSK-7F3K9Q2M-01', reason: 'open' },
      { orderId: 'GSK-7F3K9Q2M-03', reason: 'open' },
    ]);
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue({ eventId: 7, isProcessed: true });
    await expect(pollPayments(adminClient)).resolves.toMatchObject({ asked: 2, applied: 0 });
    expect(svcApplyPaymentEvent).not.toHaveBeenCalled();
  });

  it('completes a paid booking that lacks a ticket without asking Midtrans again', async () => {
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([
      { orderId: 'GSK-7F3K9Q2M-01', reason: 'paid_incomplete' },
    ]);
    vi.mocked(svcCompletePaidOrder).mockResolvedValue(true);
    await expect(pollPayments(adminClient)).resolves.toMatchObject({ asked: 1, applied: 1 });
    expect(svcCompletePaidOrder).toHaveBeenCalledWith(adminClient, {
      orderId: 'GSK-7F3K9Q2M-01',
      keyId: 'k1',
    });
    expect(getTransactionStatus).not.toHaveBeenCalled();
    expect(svcApplyPaymentEvent).not.toHaveBeenCalled();
  });

  it('counts an order Midtrans did not answer, and still does its housekeeping', async () => {
    vi.mocked(getTransactionStatus).mockRejectedValue(new Error('unreachable'));
    await expect(pollPayments(adminClient)).resolves.toMatchObject({ failed: 1, reminded: 1 });
    expect(svcPaymentsHousekeeping).toHaveBeenCalled();
  });
});
