import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  svcApplyPaymentEvent,
  svcAttachSnapToken,
  svcCompletePaidOrder,
  svcCreatePaymentAttempt,
  svcRecordPaymentEvent,
  svcRecordPaymentFailure,
  svcRecordWebhookRejection,
} from '@/db/rpc-payments';

import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const PAYMENT_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const RPC = 'http://supabase.test/rest/v1/rpc';

describe('svcCreatePaymentAttempt', () => {
  const REPLY = {
    payment_id: PAYMENT_ID,
    order_id: 'GSK-7F3K9Q2M-02',
    gross_amount: 600000,
    expires_at: '2026-10-25T02:30:00+00:00',
  };

  it('names the attempt it replaces and reads the new order back', async () => {
    const { client, requests } = clientAnswering(200, REPLY);
    await expect(
      svcCreatePaymentAttempt(client, { bookingId: BOOKING_ID, replacesPaymentId: PAYMENT_ID }),
    ).resolves.toEqual({
      paymentId: PAYMENT_ID,
      orderId: 'GSK-7F3K9Q2M-02',
      grossAmount: 600000,
      expiresAt: REPLY.expires_at,
    });
    expect(requests[0]).toEqual({
      url: `${RPC}/svc_create_payment_attempt`,
      body: { p_booking_id: BOOKING_ID, p_replaces: PAYMENT_ID },
    });
  });

  it('sends no replacement for a first attempt, and refuses a reply of another shape', async () => {
    const { client, requests } = clientAnswering(200, REPLY);
    await svcCreatePaymentAttempt(client, { bookingId: BOOKING_ID, replacesPaymentId: null });
    expect(requests[0]?.body).toEqual({ p_booking_id: BOOKING_ID });
    const odd = clientAnswering(200, { ...REPLY, gross_amount: 0 });
    await expect(
      svcCreatePaymentAttempt(odd.client, { bookingId: BOOKING_ID, replacesPaymentId: null }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe('the Snap page and a failed start', () => {
  it('attaches the page to its attempt', async () => {
    const { client, requests } = clientAnswering(204, null);
    await svcAttachSnapToken(client, { paymentId: PAYMENT_ID, snapToken: 't', redirectUrl: 'u' });
    expect(requests[0]).toEqual({
      url: `${RPC}/svc_attach_snap_token`,
      body: { p_payment_id: PAYMENT_ID, p_snap_token: 't', p_redirect_url: 'u' },
    });
  });

  it('closes an attempt Midtrans made no page for', async () => {
    const { client, requests } = clientAnswering(204, null);
    await svcRecordPaymentFailure(client, PAYMENT_ID, 'failed');
    expect(requests[0]?.body).toEqual({ p_payment_id: PAYMENT_ID, p_status: 'failed' });
  });
});

describe('svcRecordPaymentEvent', () => {
  it('stores the body by its hash and says whether it was processed', async () => {
    const { client, requests } = clientAnswering(200, { event_id: 41, is_processed: false });
    const payload = { order_id: 'GSK-7F3K9Q2M-01', transaction_status: 'settlement' };
    await expect(
      svcRecordPaymentEvent(client, { source: 'webhook', eventHash: 'a'.repeat(64), payload }),
    ).resolves.toEqual({ eventId: 41, isProcessed: false });
    expect(requests[0]).toEqual({
      url: `${RPC}/svc_record_payment_event`,
      body: { p_source: 'webhook', p_event_hash: 'a'.repeat(64), p_payload: payload },
    });
  });
});

describe('svcRecordWebhookRejection', () => {
  it('sends metadata only, leaving out what it does not know', async () => {
    const { client, requests } = clientAnswering(204, null);
    await svcRecordWebhookRejection(client, {
      reason: 'schema_invalid',
      orderId: null,
      statusCode: null,
      bodySha256: 'b'.repeat(64),
      ip: '203.0.113.7',
      userAgent: null,
    });
    expect(requests[0]?.body).toEqual({
      p_reason: 'schema_invalid',
      p_body_sha256: 'b'.repeat(64),
      p_ip: '203.0.113.7',
    });
  });
});

describe('svcApplyPaymentEvent', () => {
  it('passes the Status API body and reads the outcome, with the orders to close', async () => {
    const { client, requests } = clientAnswering(200, {
      result: 'applied',
      processing_result: 'settled',
      payment_status: 'settled',
      booking_status: 'paid',
      close_orders: ['GSK-7F3K9Q2M-01'],
    });
    const confirmed = { status_code: '200', transaction_status: 'settlement' };
    await expect(
      svcApplyPaymentEvent(client, { eventId: 41, source: 'webhook', confirmed, keyId: 'k1' }),
    ).resolves.toEqual({
      result: 'applied',
      processingResult: 'settled',
      paymentStatus: 'settled',
      bookingStatus: 'paid',
      closeOrders: ['GSK-7F3K9Q2M-01'],
    });
    expect(requests[0]?.body).toEqual({
      p_event_id: 41,
      p_source: 'webhook',
      p_key_id: 'k1',
      p_confirmed: confirmed,
    });
  });

  it('reads an outcome without statuses, and refuses an unknown result', async () => {
    const { client } = clientAnswering(200, { result: 'needs_confirmation' });
    await expect(
      svcApplyPaymentEvent(client, {
        eventId: 41,
        source: 'webhook',
        confirmed: null,
        keyId: 'k1',
      }),
    ).resolves.toEqual({
      result: 'needs_confirmation',
      processingResult: null,
      paymentStatus: null,
      bookingStatus: null,
      closeOrders: [],
    });
    const odd = clientAnswering(200, { result: 'paid' });
    await expect(
      svcApplyPaymentEvent(odd.client, {
        eventId: 41,
        source: 'poll',
        confirmed: null,
        keyId: 'k1',
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe('svcCompletePaidOrder', () => {
  it('names the order and the kid, and says whether anything was written', async () => {
    const { client, requests } = clientAnswering(200, { result: 'applied', tickets_issued: 1 });
    await expect(
      svcCompletePaidOrder(client, { orderId: 'GSK-7F3K9Q2M-01', keyId: 'k1' }),
    ).resolves.toBe(true);
    expect(requests[0]).toEqual({
      url: `${RPC}/svc_complete_paid_order`,
      body: { p_order_id: 'GSK-7F3K9Q2M-01', p_key_id: 'k1' },
    });
    const untouched = clientAnswering(200, { result: 'ignored' });
    await expect(
      svcCompletePaidOrder(untouched.client, { orderId: 'GSK-7F3K9Q2M-01', keyId: 'k1' }),
    ).resolves.toBe(false);
  });
});
