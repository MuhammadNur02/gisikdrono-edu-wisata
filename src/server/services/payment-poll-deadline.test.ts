import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcApplyPaymentEvent, svcRecordPaymentEvent } from '@/db/rpc-payments';
import type { DatabaseClient } from '@/db/rpc-result';
import { expireTransaction, getTransactionStatus } from '@/lib/midtrans/client';
import { lookAtOrder } from '@/server/services/payment-poll';

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
  requestRefund: vi.fn(),
}));

// Every RPC is a mock, so the client is never reached.
const adminClient = {} as DatabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTransactionStatus).mockResolvedValue({
    status_code: '200',
    order_id: 'GSK-7F3K9Q2M-01',
    transaction_status: 'settlement',
    gross_amount: '600000.00',
  });
  vi.mocked(svcRecordPaymentEvent).mockResolvedValue({ eventId: 7, isProcessed: false });
  vi.mocked(svcApplyPaymentEvent).mockResolvedValue({
    result: 'applied',
    processingResult: 'settled',
    paymentStatus: 'settled',
    bookingStatus: 'paid',
    closeOrders: ['GSK-7F3K9Q2M-02'],
  });
});

describe('lookAtOrder with a deadline (review of PR #105, M3)', () => {
  it('ends the orders a settlement closed while the deadline is ahead', async () => {
    await lookAtOrder(adminClient, 'GSK-7F3K9Q2M-01', Date.now() + 60_000);
    expect(expireTransaction).toHaveBeenCalledWith('GSK-7F3K9Q2M-02');
  });

  it('leaves them to their Snap expiry once the deadline has passed', async () => {
    await expect(lookAtOrder(adminClient, 'GSK-7F3K9Q2M-01', Date.now() - 1)).resolves.toEqual({
      eventId: 7,
      isBooked: true,
    });
    expect(expireTransaction).not.toHaveBeenCalled();
  });
});
