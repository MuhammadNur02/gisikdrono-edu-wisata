import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { serverEnv } from '@/lib/env';
import {
  recordProviderReports,
  recordSignatureFailure,
  withinWebhookLimit,
} from '@/server/services/provider-reports';

import { GET, POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/server/services/provider-reports', () => ({
  recordProviderReports: vi.fn(),
  recordSignatureFailure: vi.fn(),
  withinWebhookLimit: vi.fn(),
}));

const URL_BASE = 'http://localhost/api/webhooks/whatsapp';
const BODY = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        { value: { statuses: [{ id: 'wamid.A', status: 'delivered', timestamp: '1792900000' }] } },
      ],
    },
  ],
});

function signatureOf(body: string): string {
  const secret = serverEnv.WHATSAPP_APP_SECRET ?? '';
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request(URL_BASE, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signatureOf(body),
        ...headers,
      },
    }),
  );
}

describe('GET /api/webhooks/whatsapp', () => {
  it('echoes the challenge for our verify token', async () => {
    const query = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': serverEnv.WHATSAPP_VERIFY_TOKEN,
      'hub.challenge': '42',
    });
    const response = GET(new Request(`${URL_BASE}?${query.toString()}`));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('42');
  });

  it('answers 403 to a wrong token', () => {
    const query = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'lain',
      'hub.challenge': '42',
    });
    expect(GET(new Request(`${URL_BASE}?${query.toString()}`)).status).toBe(403);
  });
});

describe('POST /api/webhooks/whatsapp', () => {
  beforeEach(() => {
    vi.mocked(withinWebhookLimit).mockReset().mockResolvedValue(true);
    vi.mocked(recordSignatureFailure).mockReset().mockResolvedValue(undefined);
    vi.mocked(recordProviderReports)
      .mockReset()
      .mockResolvedValue({ updated: 1, unchanged: 0, unknown: 0, freshUnknown: 0 });
  });

  it('records the statuses of a signed body and answers 200', async () => {
    const response = await post(BODY);
    expect(response.status).toBe(200);
    expect(recordProviderReports).toHaveBeenCalledWith({}, 'whatsapp', [
      {
        providerMessageId: 'wamid.A',
        status: 'delivered',
        errorCode: null,
        occurredAt: new Date(1792900000 * 1000).toISOString(),
      },
    ]);
  });

  it('answers 403 to a wrong signature, records the failure and reads nothing', async () => {
    const response = await post(BODY, { 'x-hub-signature-256': signatureOf('{}') });
    expect(response.status).toBe(403);
    expect(recordSignatureFailure).toHaveBeenCalledWith({}, 'whatsapp', 'unknown');
    expect(recordProviderReports).not.toHaveBeenCalled();
  });

  it('answers 429 past the rate limit, so Meta retries, before the signature is checked', async () => {
    vi.mocked(withinWebhookLimit).mockResolvedValue(false);
    const response = await post(BODY, { 'x-hub-signature-256': 'sha256=00' });
    expect(response.status).toBe(429);
    expect(recordSignatureFailure).not.toHaveBeenCalled();
    expect(recordProviderReports).not.toHaveBeenCalled();
  });

  it('answers 413 to a body over 64 KB and 415 to one that is not JSON', async () => {
    expect((await post(' '.repeat(65_537))).status).toBe(413);
    expect((await post(BODY, { 'content-type': 'text/plain' })).status).toBe(415);
  });

  it('answers 400 to a signed body of another shape', async () => {
    expect((await post('{"object":1}')).status).toBe(400);
  });

  it('answers 503 to a status younger than five minutes for a message it does not know yet, so Meta sends it again', async () => {
    vi.mocked(recordProviderReports).mockResolvedValue({
      updated: 0,
      unchanged: 0,
      unknown: 1,
      freshUnknown: 1,
    });
    expect((await post(BODY)).status).toBe(503);
  });

  it('keeps 200 for an older unknown status, which no retry will match', async () => {
    vi.mocked(recordProviderReports).mockResolvedValue({
      updated: 0,
      unchanged: 0,
      unknown: 1,
      freshUnknown: 0,
    });
    expect((await post(BODY)).status).toBe(200);
  });

  it('answers 503 when the database is out of reach, so Meta retries', async () => {
    vi.mocked(recordProviderReports).mockRejectedValue(new Error('down'));
    expect((await post(BODY)).status).toBe(503);
  });
});
