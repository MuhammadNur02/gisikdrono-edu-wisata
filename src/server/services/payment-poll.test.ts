import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  svcApplyPaymentEvent,
  svcCompletePaidOrder,
  svcPaymentsHousekeeping,
  svcPaymentsToPoll,
  svcRecordPaymentEvent,
} from '@/db/rpc-payments';
import { svcFailUnconfirmedRefundByPoll, svcRecordRefundLook } from '@/db/rpc-refunds';
import type { DatabaseClient } from '@/db/rpc-result';
import {
  svcClaimRefundRetry,
  svcMarkRefundRequest,
  svcRefundRequestsToRetry,
  svcSettleLapsedWeatherLinks,
} from '@/db/rpc-terms';
import { expireTransaction, getTransactionStatus, requestRefund } from '@/lib/midtrans/client';
import { askMidtransForRefund, pollPayments } from '@/server/services/payment-poll';

vi.mock('@/db/rpc-payments', () => ({
  svcApplyPaymentEvent: vi.fn(),
  svcCompletePaidOrder: vi.fn(),
  svcPaymentsHousekeeping: vi.fn(),
  svcPaymentsToPoll: vi.fn(),
  svcRecordPaymentEvent: vi.fn(),
}));
vi.mock('@/db/rpc-refunds', () => ({
  svcFailUnconfirmedRefundByPoll: vi.fn(),
  svcRecordRefundLook: vi.fn(),
}));
vi.mock('@/db/rpc-terms', () => ({
  svcClaimRefundRetry: vi.fn(),
  svcMarkRefundRequest: vi.fn(),
  svcRefundRequestsToRetry: vi.fn(),
  svcSettleLapsedWeatherLinks: vi.fn(),
}));
vi.mock('@/lib/midtrans/client', () => ({
  expireTransaction: vi.fn(),
  getTransactionStatus: vi.fn(),
  requestRefund: vi.fn(),
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
  vi.mocked(svcRefundRequestsToRetry).mockResolvedValue([]);
  vi.mocked(svcClaimRefundRetry).mockResolvedValue(true);
  vi.mocked(svcFailUnconfirmedRefundByPoll).mockResolvedValue(false);
  vi.mocked(svcRecordRefundLook).mockResolvedValue(true);
  vi.mocked(svcSettleLapsedWeatherLinks).mockResolvedValue({
    auto_refunded: 0,
    kept: 0,
    cancelled: 0,
    held: 0,
  });
});

// The refund reference is the order id and the refund's number (internal.cancel_paid_booking).
const ORDER_ID = 'GSK-7F3K9Q2M-01';
const REFUND = {
  requestId: '3f1c2a6e-5b7d-4e8f-9a0b-1c2d3e4f5a6b',
  status: 'requested' as const,
  refundKey: `${ORDER_ID}-R01`,
  orderId: ORDER_ID,
  amount: 270000,
};
const NOTHING_NEW = { eventId: 8, isProcessed: true };

describe('pollPayments', () => {
  it('stores the Status API answer as a poll event and applies it as its own confirmation', async () => {
    await expect(pollPayments(adminClient)).resolves.toEqual({
      asked: 1,
      applied: 1,
      failed: 0,
      suspended: 0,
      reminded: 1,
      refundsRetried: 0,
      weatherRefunded: 0,
      weatherHeld: 0,
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

describe('askMidtransForRefund (review of PR #69, M1)', () => {
  it('marks a refund Midtrans took submitted', async () => {
    vi.mocked(requestRefund).mockResolvedValue({ outcome: 'accepted', statusCode: '200' });
    await expect(askMidtransForRefund(adminClient, REFUND)).resolves.toBe('accepted');
    expect(svcMarkRefundRequest).toHaveBeenCalledWith(adminClient, {
      requestId: REFUND.requestId,
      status: 'submitted',
      statusCode: '200',
      reason: null,
    });
    expect(getTransactionStatus).not.toHaveBeenCalled();
  });

  it('marks it failed only when Midtrans refuses it in so many words', async () => {
    vi.mocked(requestRefund).mockResolvedValue({ outcome: 'refused', statusCode: '412' });
    await askMidtransForRefund(adminClient, REFUND);
    expect(svcMarkRefundRequest).toHaveBeenCalledWith(
      adminClient,
      expect.objectContaining({ status: 'failed', statusCode: '412', reason: 'midtrans_refused' }),
    );
  });

  it('keeps a refund with no answer requested and asks the Status API at once', async () => {
    vi.mocked(requestRefund).mockResolvedValue({ outcome: 'unknown', statusCode: null });
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue(NOTHING_NEW);
    await askMidtransForRefund(adminClient, REFUND);
    expect(svcMarkRefundRequest).toHaveBeenCalledWith(
      adminClient,
      expect.objectContaining({ status: 'requested', reason: null }),
    );
    expect(getTransactionStatus).toHaveBeenCalledWith(REFUND.orderId, expect.any(Number));
  });

  it('survives a Status API that does not answer either', async () => {
    vi.mocked(requestRefund).mockResolvedValue({ outcome: 'unknown', statusCode: null });
    vi.mocked(getTransactionStatus).mockRejectedValue(new Error('unreachable'));
    await expect(askMidtransForRefund(adminClient, REFUND)).resolves.toBe('unknown');
  });
});

describe('pollPayments and the refunds left open (review of PR #69, H1)', () => {
  beforeEach(() => {
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([]);
  });

  it('books a refund the Status API shows done without calling the refund API again', async () => {
    vi.mocked(svcRefundRequestsToRetry).mockResolvedValue([REFUND]);
    await expect(pollPayments(adminClient)).resolves.toMatchObject({ refundsRetried: 1 });
    expect(svcApplyPaymentEvent).toHaveBeenCalled();
    expect(requestRefund).not.toHaveBeenCalled();
  });

  it('calls the refund API again, with the same key, for a request still without an answer', async () => {
    vi.mocked(svcRefundRequestsToRetry).mockResolvedValue([REFUND]);
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue(NOTHING_NEW);
    vi.mocked(requestRefund).mockResolvedValue({ outcome: 'accepted', statusCode: '200' });
    await pollPayments(adminClient);
    expect(requestRefund).toHaveBeenCalledWith(
      expect.objectContaining({ refundKey: REFUND.refundKey, amount: REFUND.amount }),
    );
  });

  it('only counts another look at a request Midtrans already took', async () => {
    vi.mocked(svcRefundRequestsToRetry).mockResolvedValue([{ ...REFUND, status: 'submitted' }]);
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue(NOTHING_NEW);
    await pollPayments(adminClient);
    expect(requestRefund).not.toHaveBeenCalled();
    expect(svcMarkRefundRequest).toHaveBeenCalledWith(
      adminClient,
      expect.objectContaining({ status: 'submitted' }),
    );
  });
});

describe('pollPayments and the weather windows (decision of 2026-10-25, rule 2)', () => {
  it('settles the closed windows and reports the refunds and the bookings held', async () => {
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([]);
    vi.mocked(svcSettleLapsedWeatherLinks).mockResolvedValue({
      auto_refunded: 2,
      kept: 1,
      cancelled: 0,
      held: 1,
    });
    await expect(pollPayments(adminClient)).resolves.toMatchObject({
      weatherRefunded: 2,
      weatherHeld: 1,
    });
    expect(svcSettleLapsedWeatherLinks).toHaveBeenCalledWith(adminClient, 20);
  });
});

describe('pollPayments steps (review of PR #69, L-3)', () => {
  it('runs the housekeeping even when the weather sweep fails, and counts the failure', async () => {
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([]);
    vi.mocked(svcSettleLapsedWeatherLinks).mockRejectedValue(new Error('down'));
    await expect(pollPayments(adminClient)).resolves.toMatchObject({ failed: 1, reminded: 1 });
    expect(svcPaymentsHousekeeping).toHaveBeenCalled();
  });
});

describe('a refund retry claims its request first (final review of PR #69, M-1)', () => {
  it('calls nothing when the request was recorded or taken meanwhile', async () => {
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([]);
    vi.mocked(svcRefundRequestsToRetry).mockResolvedValue([REFUND]);
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue(NOTHING_NEW);
    vi.mocked(svcClaimRefundRetry).mockResolvedValue(false);
    await pollPayments(adminClient);
    expect(svcClaimRefundRetry).toHaveBeenCalledWith(adminClient, REFUND.requestId);
    expect(requestRefund).not.toHaveBeenCalled();
  });
});

describe('a submitted refund Midtrans never paid out (delta review of PR #69, D-2; re-review, M-2, M-3)', () => {
  beforeEach(() => {
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([]);
    vi.mocked(svcRefundRequestsToRetry).mockResolvedValue([{ ...REFUND, status: 'submitted' }]);
  });

  it('is failed on the look the poll just took, a duplicate answer included', async () => {
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue(NOTHING_NEW);
    vi.mocked(svcFailUnconfirmedRefundByPoll).mockResolvedValue(true);
    await pollPayments(adminClient);
    expect(svcFailUnconfirmedRefundByPoll).toHaveBeenCalledWith(adminClient, {
      requestId: REFUND.requestId,
      eventId: NOTHING_NEW.eventId,
    });
    expect(svcMarkRefundRequest).not.toHaveBeenCalled();
    expect(requestRefund).not.toHaveBeenCalled();
  });

  it('is never failed when the Status API does not answer', async () => {
    vi.mocked(getTransactionStatus).mockRejectedValue(new Error('timeout'));
    await expect(pollPayments(adminClient)).resolves.toMatchObject({ refundsRetried: 0 });
    expect(svcFailUnconfirmedRefundByPoll).not.toHaveBeenCalled();
    expect(svcMarkRefundRequest).not.toHaveBeenCalled();
  });

  it('is never failed on an order Midtrans does not know', async () => {
    vi.mocked(getTransactionStatus).mockResolvedValue({ ...SETTLED, status_code: '404' });
    await pollPayments(adminClient);
    expect(svcFailUnconfirmedRefundByPoll).not.toHaveBeenCalled();
    expect(svcMarkRefundRequest).toHaveBeenCalledWith(
      adminClient,
      expect.objectContaining({ status: 'submitted' }),
    );
  });

  it('is booked, not failed, when the answer shows the refund', async () => {
    await pollPayments(adminClient);
    expect(svcApplyPaymentEvent).toHaveBeenCalled();
    expect(svcFailUnconfirmedRefundByPoll).not.toHaveBeenCalled();
  });
});

describe('the look at a requested refund is stored (re-review of PR #69, M-3)', () => {
  it('stores the look with the request before the refund API is called again', async () => {
    vi.mocked(svcPaymentsToPoll).mockResolvedValue([]);
    vi.mocked(svcRefundRequestsToRetry).mockResolvedValue([REFUND]);
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue(NOTHING_NEW);
    vi.mocked(requestRefund).mockResolvedValue({ outcome: 'accepted', statusCode: '200' });
    await pollPayments(adminClient);
    expect(svcRecordRefundLook).toHaveBeenCalledWith(adminClient, {
      requestId: REFUND.requestId,
      eventId: NOTHING_NEW.eventId,
    });
    expect(requestRefund).toHaveBeenCalled();
  });
});
