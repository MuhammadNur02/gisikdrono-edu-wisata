import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  svcAttachSnapToken,
  svcCreatePaymentAttempt,
  svcRecordPaymentFailure,
} from '@/db/rpc-payments';
import { copy } from '@/lib/copy/id';
import { createSnapTransaction, expireTransaction } from '@/lib/midtrans/client';
import { openAttemptOf, snapBookingOf } from '@/server/services/payment-reads';
import { startPayment } from '@/server/services/payment-service';

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

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const PAGE_URL = 'https://app.sandbox.midtrans.com/snap/v4/redirection/token';
const HOUR_MS = 3_600_000;
const PREPARED = {
  booking: {
    bookingId: BOOKING_ID,
    bookingCode: 'GSK-7F3K9Q2M',
    totalAmount: 600000,
    packageName: 'Paket Uji',
    packageQuantity: 20,
    packageUnitPrice: 30000,
    subtotalPackage: 600000,
    discountAmount: 0,
    picName: 'Ani',
    picEmail: 'ani@contoh.test',
    picPhone: '+6281234567890',
    expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
  },
  addons: [],
};
const ATTEMPT = {
  paymentId: '0192f3a4-5b6c-7d8e-9f01-0000000000c2',
  orderId: 'GSK-7F3K9Q2M-02',
  grossAmount: 600000,
  expiresAt: PREPARED.booking.expiresAt,
};
const ABANDONED = {
  paymentId: '0192f3a4-5b6c-7d8e-9f01-0000000000c1',
  orderId: 'GSK-7F3K9Q2M-01',
  status: 'initiated' as const,
  redirectUrl: null,
  createdAt: new Date(Date.now() - HOUR_MS).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  recorded.grossAmount = 600000;
  vi.mocked(openAttemptOf).mockResolvedValue(null);
  vi.mocked(snapBookingOf).mockResolvedValue(PREPARED);
  vi.mocked(svcCreatePaymentAttempt).mockResolvedValue(ATTEMPT);
  vi.mocked(createSnapTransaction).mockResolvedValue({ token: 'token', redirectUrl: PAGE_URL });
});

describe('startPayment', () => {
  it('makes the first attempt and its Snap page from the booking rows', async () => {
    await expect(startPayment(BOOKING_ID)).resolves.toEqual({ redirectUrl: PAGE_URL });
    expect(svcCreatePaymentAttempt).toHaveBeenCalledWith(expect.anything(), {
      bookingId: BOOKING_ID,
      replacesPaymentId: null,
    });
    const [payload] = vi.mocked(createSnapTransaction).mock.calls[0] ?? [];
    expect(payload?.transaction_details).toEqual({
      order_id: 'GSK-7F3K9Q2M-02',
      gross_amount: 600000,
    });
    expect(svcAttachSnapToken).toHaveBeenCalledWith(expect.anything(), {
      paymentId: ATTEMPT.paymentId,
      snapToken: 'token',
      redirectUrl: PAGE_URL,
    });
  });

  it('reuses an open page instead of asking Midtrans for another', async () => {
    vi.mocked(openAttemptOf).mockResolvedValue({
      ...ABANDONED,
      status: 'pending',
      redirectUrl: PAGE_URL,
    });
    await expect(startPayment(BOOKING_ID)).resolves.toEqual({ redirectUrl: PAGE_URL });
    expect(svcCreatePaymentAttempt).not.toHaveBeenCalled();
  });

  it('ends an abandoned attempt at Midtrans before replacing it (WH-16)', async () => {
    vi.mocked(openAttemptOf).mockResolvedValue(ABANDONED);
    vi.mocked(expireTransaction).mockResolvedValue('not_charged');
    await startPayment(BOOKING_ID);
    expect(expireTransaction).toHaveBeenCalledWith('GSK-7F3K9Q2M-01');
    expect(svcCreatePaymentAttempt).toHaveBeenCalledWith(expect.anything(), {
      bookingId: BOOKING_ID,
      replacesPaymentId: ABANDONED.paymentId,
    });
  });

  it('makes no new attempt while Midtrans will not end the old order', async () => {
    vi.mocked(openAttemptOf).mockResolvedValue(ABANDONED);
    vi.mocked(expireTransaction).mockResolvedValue('refused');
    await expect(startPayment(BOOKING_ID)).rejects.toMatchObject({ code: 'PAYMENT' });
    expect(svcCreatePaymentAttempt).not.toHaveBeenCalled();
  });

  it('waits for another request still asking Midtrans for a page', async () => {
    vi.mocked(openAttemptOf).mockResolvedValue({
      ...ABANDONED,
      createdAt: new Date().toISOString(),
    });
    await expect(startPayment(BOOKING_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      userMessage: copy.booking.payment.errors.preparing,
    });
    expect(expireTransaction).not.toHaveBeenCalled();
  });

  it('takes no payment for a booking under review', async () => {
    vi.mocked(openAttemptOf).mockResolvedValue({ ...ABANDONED, status: 'needs_review' });
    await expect(startPayment(BOOKING_ID)).rejects.toMatchObject({
      code: 'STATE_INVALID',
      userMessage: copy.booking.payment.underReview,
    });
  });

  it('makes no page with less than five minutes of the hold left (BOOK-14)', async () => {
    vi.mocked(snapBookingOf).mockResolvedValue({
      ...PREPARED,
      booking: { ...PREPARED.booking, expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    await expect(startPayment(BOOKING_ID)).rejects.toMatchObject({
      code: 'STATE_INVALID',
      userMessage: copy.booking.payment.errors.tooLate,
    });
    expect(svcCreatePaymentAttempt).not.toHaveBeenCalled();
  });

  it('closes the attempt when Midtrans makes no page for it, so the next try starts afresh', async () => {
    vi.mocked(createSnapTransaction).mockRejectedValue(new Error('refused'));
    await expect(startPayment(BOOKING_ID)).rejects.toMatchObject({ code: 'PAYMENT' });
    expect(svcRecordPaymentFailure).toHaveBeenCalledWith(
      expect.anything(),
      ATTEMPT.paymentId,
      'failed',
    );
    expect(svcAttachSnapToken).not.toHaveBeenCalled();
  });
});
