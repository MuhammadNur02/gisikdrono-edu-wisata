import { beforeEach, describe, expect, it, vi } from 'vitest';

import { midtransSignature } from '@/lib/midtrans/verify-signature';
import { kickNotificationWorker } from '@/server/services/notification-service';
import {
  expireClosedOrders,
  processMidtransNotification,
  recordWebhookRejection,
  withinPaymentLimits,
} from '@/server/services/payment-service';

import { POST } from './route';
import { sandboxEnv } from '../../../../../../tests/fixtures/env';

const afterCallbacks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    afterCallbacks.push(callback);
  },
}));
vi.mock('@/server/services/payment-service', () => ({
  expireClosedOrders: vi.fn(),
  processMidtransNotification: vi.fn(),
  recordWebhookRejection: vi.fn(),
  withinPaymentLimits: vi.fn(),
}));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));

const SIGNED = { order_id: 'GSK-7F3K9Q2M-01', status_code: '200', gross_amount: '600000.00' };
const NOTIFICATION = {
  ...SIGNED,
  signature_key: midtransSignature(SIGNED, sandboxEnv.MIDTRANS_SERVER_KEY),
  transaction_status: 'settlement',
  transaction_id: 'txn-1',
  payment_type: 'bank_transfer',
  currency: 'IDR',
  fraud_status: 'accept',
  merchant_id: sandboxEnv.MIDTRANS_MERCHANT_ID,
};
const APPLIED = {
  result: 'applied' as const,
  processingResult: 'settled',
  paymentStatus: 'settled' as const,
  bookingStatus: 'paid' as const,
  closeOrders: ['GSK-7F3K9Q2M-02'],
};

function post(body: string, init: { token?: string; contentType?: string } = {}) {
  const request = new Request('http://127.0.0.1:3000/api/webhooks/midtrans/x', {
    method: 'POST',
    headers: { 'content-type': init.contentType ?? 'application/json', 'x-real-ip': '203.0.113.7' },
    body,
  });
  const token = init.token ?? sandboxEnv.MIDTRANS_WEBHOOK_PATH_TOKEN;
  return POST(request, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.mocked(withinPaymentLimits).mockResolvedValue(true);
  vi.mocked(processMidtransNotification).mockResolvedValue(APPLIED);
});

describe('POST /api/webhooks/midtrans/[token]', () => {
  it('applies a signed notification and answers 200, kicking the outbox afterwards', async () => {
    const response = await post(JSON.stringify(NOTIFICATION));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'applied' });
    expect(processMidtransNotification).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 'GSK-7F3K9Q2M-01' }),
      JSON.stringify(NOTIFICATION),
    );
    await Promise.all(afterCallbacks.map((callback) => callback()));
    expect(kickNotificationWorker).toHaveBeenCalled();
    expect(expireClosedOrders).toHaveBeenCalledWith(['GSK-7F3K9Q2M-02']);
  });

  it('answers a duplicate delivery 200 and kicks nothing', async () => {
    vi.mocked(processMidtransNotification).mockResolvedValue({ result: 'duplicate_delivery' });
    const response = await post(JSON.stringify(NOTIFICATION));
    await expect(response.json()).resolves.toEqual({ status: 'duplicate_delivery' });
    expect(afterCallbacks).toHaveLength(0);
  });

  it('answers 404 to a wrong path token before anything is counted or written (step 1)', async () => {
    const response = await post(JSON.stringify(NOTIFICATION), { token: 'wrong' });
    expect(response.status).toBe(404);
    expect(withinPaymentLimits).not.toHaveBeenCalled();
  });

  it('counts the sender and everyone before anything else (step 2)', async () => {
    vi.mocked(withinPaymentLimits).mockResolvedValue(false);
    const response = await post(JSON.stringify(NOTIFICATION));
    expect(response.status).toBe(429);
    expect(withinPaymentLimits).toHaveBeenCalledWith([
      { name: 'webhook_midtrans:ip', subject: '203.0.113.7' },
      { name: 'webhook_midtrans:all', subject: 'all' },
    ]);
    expect(recordWebhookRejection).not.toHaveBeenCalled();
  });

  it('refuses another type with 415 and a body over 16 KB with 413 (step 3)', async () => {
    expect((await post('{}', { contentType: 'text/plain' })).status).toBe(415);
    expect((await post(`{"pad":"${'x'.repeat(16_384)}"}`)).status).toBe(413);
    expect(recordWebhookRejection).toHaveBeenCalledTimes(2);
  });

  it('refuses a body that is not a notification with 400 (step 4)', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({ ...NOTIFICATION, signature_key: 'short' }))).status).toBe(
      400,
    );
    expect(vi.mocked(recordWebhookRejection).mock.calls[0]?.[0]).toMatchObject({
      reason: 'schema_invalid',
    });
  });

  it('refuses a bad signature with 403 and records metadata only, never the body (step 5)', async () => {
    const forged = { ...NOTIFICATION, gross_amount: '1.00' };
    const response = await post(JSON.stringify(forged));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    const [rejection, ipBucket] = vi.mocked(recordWebhookRejection).mock.calls[0] ?? [];
    expect(rejection).toMatchObject({
      reason: 'signature_invalid',
      orderId: 'GSK-7F3K9Q2M-01',
      statusCode: '200',
      ip: '203.0.113.7',
      userAgent: null,
    });
    expect(Object.keys(rejection ?? {})).not.toContain('body');
    expect(rejection?.bodySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ipBucket).toBe('203.0.113.7');
    expect(processMidtransNotification).not.toHaveBeenCalled();
  });

  it('refuses a notification that names no merchant (review of PR #39, L3)', async () => {
    const unnamed = Object.fromEntries(
      Object.entries(NOTIFICATION).filter(([key]) => key !== 'merchant_id'),
    );
    expect((await post(JSON.stringify(unnamed))).status).toBe(400);
  });

  it('refuses another merchant with 403 (step 6, docs/PRD.md §10.1)', async () => {
    const response = await post(JSON.stringify({ ...NOTIFICATION, merchant_id: 'G999' }));
    expect(response.status).toBe(403);
    expect(vi.mocked(recordWebhookRejection).mock.calls[0]?.[0]).toMatchObject({
      reason: 'merchant_mismatch',
    });
    expect(processMidtransNotification).not.toHaveBeenCalled();
  });

  it('answers 503 when the database or the Status API is out of reach, so Midtrans retries', async () => {
    vi.mocked(processMidtransNotification).mockRejectedValue(new Error('unreachable'));
    expect((await post(JSON.stringify(NOTIFICATION))).status).toBe(503);
    vi.mocked(withinPaymentLimits).mockRejectedValue(new Error('database down'));
    expect((await post(JSON.stringify(NOTIFICATION))).status).toBe(503);
  });

  it('answers the same refusal when recording it fails', async () => {
    vi.mocked(recordWebhookRejection).mockRejectedValue(new Error('database down'));
    expect((await post('not json')).status).toBe(400);
  });
});
