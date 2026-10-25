import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcApplyPaymentEvent, svcRecordPaymentEvent } from '@/db/rpc-payments';
import { getTransactionStatus } from '@/lib/midtrans/client';
import { recheckPaymentStatus } from '@/server/services/payment-service';

// recheckPaymentStatus, the "Cek status Midtrans" of /dashboard/finance/reconciliation (Task P4.7.04, N12).

const ORDER_ID = 'GSK-7F3K9Q2M-02';
const PAYMENT_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000c2';
const stored: { orderId: string | null } = vi.hoisted(() => ({ orderId: 'GSK-7F3K9Q2M-02' }));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: stored.orderId === null ? null : { order_id: stored.orderId },
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

const SETTLED = { order_id: ORDER_ID, status_code: '200', transaction_status: 'settlement' };

beforeEach(() => {
  vi.clearAllMocks();
  stored.orderId = ORDER_ID;
  vi.mocked(svcRecordPaymentEvent).mockResolvedValue({ eventId: 77, isProcessed: false });
  vi.mocked(svcApplyPaymentEvent).mockResolvedValue({
    result: 'applied',
    processingResult: 'settled',
    paymentStatus: 'settled',
    bookingStatus: 'paid',
    closeOrders: [],
  });
});

describe('recheckPaymentStatus', () => {
  it('keeps the answer about the order as a status_api event, then applies it', async () => {
    vi.mocked(getTransactionStatus).mockResolvedValue(SETTLED);
    await expect(recheckPaymentStatus(PAYMENT_ID)).resolves.toEqual({ result: 'applied', status: 'settled' });
    expect(svcRecordPaymentEvent).toHaveBeenCalledWith(expect.anything(), {
      source: 'status_api',
      eventHash: createHash('sha256').update(`status_api\n${JSON.stringify(SETTLED)}`).digest('hex'),
      payload: SETTLED,
    });
    expect(svcApplyPaymentEvent).toHaveBeenCalledWith(expect.anything(), {
      eventId: 77,
      source: 'status_api',
      confirmed: null,
      keyId: 'k1',
    });
  });

  it('applies nothing when Midtrans knows no such order', async () => {
    vi.mocked(getTransactionStatus).mockResolvedValue({ status_code: '404', status_message: 'not found' });
    await expect(recheckPaymentStatus(PAYMENT_ID)).resolves.toEqual({ result: 'not_found', status: null });
    expect(svcRecordPaymentEvent).not.toHaveBeenCalled();
    expect(svcApplyPaymentEvent).not.toHaveBeenCalled();
  });

  it('says nothing changed for an answer it has applied before', async () => {
    vi.mocked(getTransactionStatus).mockResolvedValue(SETTLED);
    vi.mocked(svcRecordPaymentEvent).mockResolvedValue({ eventId: 77, isProcessed: true });
    await expect(recheckPaymentStatus(PAYMENT_ID)).resolves.toEqual({ result: 'unchanged', status: null });
    expect(svcApplyPaymentEvent).not.toHaveBeenCalled();
  });

  it('refuses a payment that does not exist', async () => {
    stored.orderId = null;
    await expect(recheckPaymentStatus(PAYMENT_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
