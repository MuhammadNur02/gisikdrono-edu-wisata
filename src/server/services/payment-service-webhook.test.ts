import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcApplyPaymentEvent, svcRecordPaymentEvent } from '@/db/rpc-payments';
import { getTransactionStatus } from '@/lib/midtrans/client';
import type { MidtransNotification } from '@/lib/midtrans/schemas';
import { processMidtransNotification } from '@/server/services/payment-service';

// processMidtransNotification (CLAUDE.md §7.2 steps 7–10), split from payment-service.test.ts, which keeps startPayment.

// The amount the database holds for the notified order, or null for an order it never issued.
const recorded: { grossAmount: number | null } = vi.hoisted(() => ({ grossAmount: 600000 }));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: recorded.grossAmount === null ? null : { gross_amount: recorded.grossAmount },
              error: null,
            }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/db/rpc-payments', () => ({
  svcApplyPaymentEvent: vi.fn(),
  svcAttachSnapToken: vi.fn(),
  svcCreatePaymentAttempt: vi.fn(),
  svcRecordPaymentEvent: vi.fn(),
  svcRecordPaymentFailure: vi.fn(),
  svcRecordWebhookRejection: vi.fn(),
}));
vi.mock('@/lib/midtrans/client', () => ({
  WEBHOOK_STATUS_TIMEOUT_MS: 5000,
  createSnapTransaction: vi.fn(),
  expireTransaction: vi.fn(),
  getTransactionStatus: vi.fn(),
}));
vi.mock('@/server/services/payment-reads', () => ({
  openAttemptOf: vi.fn(),
  paymentPageOf: vi.fn(),
  snapBookingOf: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ withinRateLimits: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  recorded.grossAmount = 600000;
});

const NOTIFICATION: MidtransNotification = {
  order_id: 'GSK-7F3K9Q2M-02',
  status_code: '200',
  gross_amount: '600000.00',
  signature_key: 'a'.repeat(128),
  transaction_status: 'settlement',
  transaction_id: 'txn-1',
  payment_type: 'bank_transfer',
  currency: 'IDR',
  fraud_status: 'accept',
  merchant_id: 'G000000000',
};
const RAW_BODY = JSON.stringify(NOTIFICATION);
const CONFIRMED = {
  order_id: 'GSK-7F3K9Q2M-02',
  status_code: '200',
  transaction_status: 'settlement',
  gross_amount: '600000.00',
};
const APPLIED = {
  result: 'applied' as const,
  processingResult: 'settled',
  paymentStatus: 'settled' as const,
  bookingStatus: 'paid' as const,
  closeOrders: [],
};

describe('processMidtransNotification', () => {
  beforeEach(() => {
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue({ eventId: 41, isProcessed: false });
    vi.mocked(getTransactionStatus).mockResolvedValue(CONFIRMED);
    vi.mocked(svcApplyPaymentEvent).mockResolvedValue(APPLIED);
  });

  it('stores the body by its hash, asks the Status API, then applies the confirmed event', async () => {
    await expect(processMidtransNotification(NOTIFICATION, RAW_BODY)).resolves.toEqual(APPLIED);
    expect(svcRecordPaymentEvent).toHaveBeenCalledWith(expect.anything(), {
      source: 'webhook',
      eventHash: createHash('sha256').update(RAW_BODY).digest('hex'),
      payload: NOTIFICATION,
    });
    expect(getTransactionStatus).toHaveBeenCalledWith('GSK-7F3K9Q2M-02', 5000);
    expect(svcApplyPaymentEvent).toHaveBeenCalledWith(expect.anything(), {
      eventId: 41,
      source: 'webhook',
      confirmed: CONFIRMED,
      keyId: 'k1',
    });
  });

  it('keeps the Status API answer as a status_api event of its own (N9)', async () => {
    await processMidtransNotification(NOTIFICATION, RAW_BODY);
    expect(svcRecordPaymentEvent).toHaveBeenCalledWith(expect.anything(), {
      source: 'status_api',
      eventHash: createHash('sha256')
        .update(`status_api\n${JSON.stringify(CONFIRMED)}`)
        .digest('hex'),
      payload: CONFIRMED,
    });
  });

  it('keeps no answer about another order, a 404 included, yet still hands it to apply (L3)', async () => {
    const notFound = { status_code: '404', status_message: 'Transaction does not exist.' };
    vi.mocked(getTransactionStatus).mockResolvedValue(notFound);
    await processMidtransNotification(NOTIFICATION, RAW_BODY);
    expect(svcRecordPaymentEvent).toHaveBeenCalledTimes(1);
    expect(svcRecordPaymentEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'webhook' }),
    );
    expect(svcApplyPaymentEvent).toHaveBeenCalledWith(expect.anything(), {
      eventId: 41,
      source: 'webhook',
      confirmed: notFound,
      keyId: 'k1',
    });
  });

  it('answers a body already processed as a duplicate delivery, applying nothing', async () => {
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue({ eventId: 41, isProcessed: true });
    await expect(processMidtransNotification(NOTIFICATION, RAW_BODY)).resolves.toEqual({
      result: 'duplicate_delivery',
    });
    expect(svcApplyPaymentEvent).not.toHaveBeenCalled();
  });

  // Review of PR #39, L1: a signature covers no Virtual Account, so a pending body replayed with another one is applied
  // with what the Status API says, and its own va_number reaches nothing.
  it('confirms a pending notification too, and applies the Status API body rather than its own', async () => {
    const replayed = {
      ...NOTIFICATION,
      transaction_status: 'pending',
      status_code: '201',
      va_numbers: [{ bank: 'bca', va_number: '99999999999' }],
    };
    const confirmedPending = {
      status_code: '201',
      transaction_status: 'pending',
      gross_amount: '600000.00',
      va_numbers: [{ bank: 'bca', va_number: '12345678901' }],
    };
    vi.mocked(getTransactionStatus).mockResolvedValue(confirmedPending);
    await processMidtransNotification(replayed, JSON.stringify(replayed));
    expect(getTransactionStatus).toHaveBeenCalledWith('GSK-7F3K9Q2M-02', 5000);
    expect(svcApplyPaymentEvent).toHaveBeenCalledWith(expect.anything(), {
      eventId: 41,
      source: 'webhook',
      confirmed: confirmedPending,
      keyId: 'k1',
    });
  });

  it('leaves an unknown order or another amount to the database, without asking Midtrans', async () => {
    recorded.grossAmount = null;
    await processMidtransNotification(NOTIFICATION, RAW_BODY);
    recorded.grossAmount = 1;
    await processMidtransNotification(NOTIFICATION, RAW_BODY);
    expect(getTransactionStatus).not.toHaveBeenCalled();
  });

  it('asks the Status API after all when the database wants a confirmation', async () => {
    const pending = { ...NOTIFICATION, transaction_status: 'authorize' };
    vi.mocked(svcApplyPaymentEvent).mockResolvedValueOnce({
      ...APPLIED,
      result: 'needs_confirmation',
    });
    await expect(processMidtransNotification(pending, JSON.stringify(pending))).resolves.toEqual(
      APPLIED,
    );
    expect(svcApplyPaymentEvent).toHaveBeenLastCalledWith(expect.anything(), {
      eventId: 41,
      source: 'webhook',
      confirmed: CONFIRMED,
      keyId: 'k1',
    });
  });

  it('passes a Status API outage on, so the webhook answers 503 and Midtrans retries', async () => {
    vi.mocked(getTransactionStatus).mockRejectedValue(new Error('unreachable'));
    await expect(processMidtransNotification(NOTIFICATION, RAW_BODY)).rejects.toThrow(
      'unreachable',
    );
    expect(svcApplyPaymentEvent).not.toHaveBeenCalled();
  });
});
