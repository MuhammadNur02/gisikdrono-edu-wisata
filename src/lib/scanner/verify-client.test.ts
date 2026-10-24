import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendScan } from '@/lib/scanner/verify-client';
import type { VerifyTicketRequest, VerifyTicketResponse } from '@/types/scanner';

import { fakeTicketToken } from '../../../tests/fixtures/ticket-token';

const REQUEST: VerifyTicketRequest = {
  token: fakeTicketToken(),
  attemptId: '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
  mode: 'preview',
};
const RESPONSE: VerifyTicketResponse = {
  result: 'ok',
  mode: 'preview',
  attemptId: REQUEST.attemptId,
  ticket: {
    ticketCode: 'GSK-7F3K9Q2M-05',
    institutionName: 'SD Negeri Gisikdrono 01',
    picFirstName: 'Siti',
    packageName: 'Eduwisata Ecowastreme',
    visitDate: '2026-10-24',
    sessionStart: '09:00:00',
    sessionEnd: '11:00:00',
    paxCount: 30,
    participantCount: 28,
    addons: [{ name: 'Kompos 1 kg', quantity: 5 }],
  },
  usedAt: null,
  usedBy: null,
  checkedInPax: null,
  unpaidPax: null,
};
const ONLINE = { isOnline: () => true };

function answer(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sendScan', () => {
  it('posts the request as JSON to the verify route and reads the answer', async () => {
    answer(200, RESPONSE);
    await expect(sendScan(REQUEST, ONLINE)).resolves.toEqual({
      kind: 'answered',
      response: RESPONSE,
    });
    const [path, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(path).toBe('/api/tickets/verify');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(REQUEST));
  });

  it('keeps fields a newer server adds out of the way', async () => {
    answer(200, { ...RESPONSE, futureField: 1 });
    const outcome = await sendScan(REQUEST, ONLINE);
    expect(outcome.kind).toBe('answered');
  });

  it('sends nothing while the device is offline', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(sendScan(REQUEST, { isOnline: () => false })).resolves.toEqual({
      kind: 'offline',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads a failed network as offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(sendScan(REQUEST, ONLINE)).resolves.toEqual({ kind: 'offline' });
  });

  it('gives up after the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_path: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    await expect(sendScan(REQUEST, { ...ONLINE, timeoutMs: 5 })).resolves.toEqual({
      kind: 'timeout',
    });
  });

  it.each([
    [401, { kind: 'signed_out' }],
    [403, { kind: 'signed_out' }],
    [404, { kind: 'unavailable' }],
    [405, { kind: 'unavailable' }],
    [500, { kind: 'failed' }],
    [503, { kind: 'failed' }],
  ])('maps HTTP %i', async (status, outcome) => {
    answer(status, {});
    await expect(sendScan(REQUEST, ONLINE)).resolves.toEqual(outcome);
  });

  it('passes Retry-After on with a rate limit', async () => {
    answer(429, {}, { 'Retry-After': '5' });
    await expect(sendScan(REQUEST, ONLINE)).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: 5,
    });
    answer(429, {});
    await expect(sendScan(REQUEST, ONLINE)).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: null,
    });
  });

  it('refuses an answer outside the contract', async () => {
    answer(200, { ...RESPONSE, result: 'great' });
    await expect(sendScan(REQUEST, ONLINE)).resolves.toEqual({ kind: 'failed' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>', { status: 200 }))),
    );
    await expect(sendScan(REQUEST, ONLINE)).resolves.toEqual({ kind: 'failed' });
  });
});
