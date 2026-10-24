import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSnapTransaction,
  expireTransaction,
  getTransactionStatus,
  MidtransError,
} from '@/lib/midtrans/client';
import type { SnapPayload } from '@/lib/midtrans/snap';

const env = vi.hoisted(() => ({
  serverEnv: {
    MIDTRANS_SERVER_KEY: 'SB-Mid-server-fixture',
    MIDTRANS_IS_PRODUCTION: false,
    MIDTRANS_LOCAL_STUB_URL: undefined as string | undefined,
  },
}));
vi.mock('@/lib/env', () => env);

const PAYLOAD: SnapPayload = {
  transaction_details: { order_id: 'GSK-7F3K9Q2M-01', gross_amount: 30000 },
  item_details: [{ id: 'package', name: 'Paket Uji', price: 30000, quantity: 1 }],
  customer_details: { first_name: 'Ani', email: 'ani@contoh.test', phone: '+6281234567890' },
  enabled_payments: ['qris'],
  expiry: { start_time: '2026-10-24 09:30:00 +0700', unit: 'minute', duration: 60 },
  callbacks: { finish: 'https://eduwisata.example.test/reservasi/GSK-7F3K9Q2M' },
  custom_field1: '0192f3a4-5b6c-7d8e-9f01-0000000000bb',
};
const SNAP_PAGE = {
  token: 'snap-token',
  redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token',
};
const fetchMock = vi.fn<typeof fetch>();

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  env.serverEnv.MIDTRANS_LOCAL_STUB_URL = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSnapTransaction', () => {
  it('asks Snap on the sandbox host with the server key, and answers the page', async () => {
    fetchMock.mockResolvedValue(answer(201, SNAP_PAGE));
    await expect(createSnapTransaction(PAYLOAD)).resolves.toEqual({
      token: 'snap-token',
      redirectUrl: SNAP_PAGE.redirect_url,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('SB-Mid-server-fixture:').toString('base64')}`,
    );
    expect(init?.body).toBe(JSON.stringify(PAYLOAD));
  });

  it('never redirects to a page off Snap’s own host', async () => {
    fetchMock.mockResolvedValue(
      answer(201, { ...SNAP_PAGE, redirect_url: 'https://evil.example.test/pay' }),
    );
    await expect(createSnapTransaction(PAYLOAD)).rejects.toMatchObject({ reason: 'malformed' });
  });

  it('takes a refusal as final, with no second request', async () => {
    fetchMock.mockResolvedValue(answer(400, { error_messages: ['order_id sudah digunakan'] }));
    await expect(createSnapTransaction(PAYLOAD)).rejects.toMatchObject({
      reason: 'refused',
      httpStatus: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries once more after a network error, and no more', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    fetchMock.mockResolvedValueOnce(answer(201, SNAP_PAGE));
    await expect(createSnapTransaction(PAYLOAD)).resolves.toMatchObject({ token: 'snap-token' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(createSnapTransaction(PAYLOAD)).rejects.toBeInstanceOf(MidtransError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never repeats a request that timed out, since it may have reached Midtrans', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(createSnapTransaction(PAYLOAD)).rejects.toMatchObject({ reason: 'unreachable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks the local stand-in instead when MIDTRANS_LOCAL_STUB_URL is set', async () => {
    env.serverEnv.MIDTRANS_LOCAL_STUB_URL = 'http://127.0.0.1:4010';
    fetchMock.mockResolvedValue(
      answer(201, { token: 't', redirect_url: 'http://127.0.0.1:4010/snap/v4/redirection/t' }),
    );
    await createSnapTransaction(PAYLOAD);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4010/snap/v1/transactions');
  });
});

describe('getTransactionStatus', () => {
  it('answers what Midtrans says of the order', async () => {
    fetchMock.mockResolvedValue(
      answer(200, { status_code: '200', transaction_status: 'settlement', gross_amount: '1.00' }),
    );
    await expect(getTransactionStatus('GSK-7F3K9Q2M-01', 5000)).resolves.toMatchObject({
      transaction_status: 'settlement',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.sandbox.midtrans.com/v2/GSK-7F3K9Q2M-01/status',
    );
  });

  it('takes Midtrans’ own 404 for an order it never charged as an answer', async () => {
    fetchMock.mockResolvedValue(
      answer(404, { status_code: '404', status_message: "Transaction doesn't exist." }),
    );
    await expect(getTransactionStatus('GSK-7F3K9Q2M-01')).resolves.toMatchObject({
      status_code: '404',
    });
  });

  it('takes a refused key or a server error as no answer', async () => {
    fetchMock.mockResolvedValue(answer(401, { status_code: '401' }));
    await expect(getTransactionStatus('GSK-7F3K9Q2M-01')).rejects.toMatchObject({
      reason: 'unreachable',
    });
    fetchMock.mockResolvedValue(answer(403, { status_code: '403' }));
    await expect(getTransactionStatus('GSK-7F3K9Q2M-01')).rejects.toMatchObject({
      reason: 'refused',
    });
    fetchMock.mockResolvedValue(new Response('<html>busy</html>', { status: 502 }));
    await expect(getTransactionStatus('GSK-7F3K9Q2M-01')).rejects.toMatchObject({
      reason: 'malformed',
    });
  });
});

describe('getTransactionStatus on HTTP 200', () => {
  it('takes Midtrans’ own failure in the body as no answer, so the webhook answers 503 (review of PR #39, L2)', async () => {
    for (const statusCode of ['500', '503', '401']) {
      fetchMock.mockResolvedValue(answer(200, { status_code: statusCode }));
      await expect(getTransactionStatus('GSK-7F3K9Q2M-01')).rejects.toMatchObject({
        reason: 'unreachable',
      });
    }
  });
});

describe('expireTransaction', () => {
  it.each([
    [407, { status_code: '407', transaction_status: 'expire' }, 'expired'],
    [404, { status_code: '404' }, 'not_charged'],
    [412, { status_code: '412', status_message: 'Merchant cannot modify' }, 'refused'],
    [500, { unexpected: true }, 'refused'],
  ])('answers HTTP %i as %s', async (status, body, expected) => {
    fetchMock.mockResolvedValue(answer(status, body));
    await expect(expireTransaction('GSK-7F3K9Q2M-01')).resolves.toBe(expected);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.sandbox.midtrans.com/v2/GSK-7F3K9Q2M-01/expire',
    );
  });
});
