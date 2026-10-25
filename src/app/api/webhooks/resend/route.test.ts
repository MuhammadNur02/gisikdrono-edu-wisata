import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { serverEnv } from '@/lib/env';
import {
  recordProviderReports,
  recordSignatureFailure,
  withinWebhookLimit,
} from '@/server/services/provider-reports';

import { POST } from './route';

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock('@/server/services/provider-reports', () => ({
  recordProviderReports: vi.fn(),
  recordSignatureFailure: vi.fn(),
  withinWebhookLimit: vi.fn(),
}));

const URL_BASE = 'http://localhost/api/webhooks/resend';
const NOW = new Date('2026-10-25T03:00:00Z');
const NOW_SECONDS = String(Math.floor(NOW.getTime() / 1000));
const ID = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W';
const BOUNCE = JSON.stringify({
  type: 'email.bounced',
  created_at: '2026-10-25T02:59:00.000Z',
  data: { email_id: 're_1' },
});

function signatureOf(body: string, timestamp = NOW_SECONDS): string {
  const secret = serverEnv.RESEND_WEBHOOK_SECRET ?? '';
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return `v1,${createHmac('sha256', key).update(`${ID}.${timestamp}.${body}`).digest('base64')}`;
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request(URL_BASE, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'svix-id': ID,
        'svix-timestamp': NOW_SECONDS,
        'svix-signature': signatureOf(body),
        ...headers,
      },
    }),
  );
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.mocked(withinWebhookLimit).mockReset().mockResolvedValue(true);
    vi.mocked(recordSignatureFailure).mockReset().mockResolvedValue(undefined);
    vi.mocked(recordProviderReports)
      .mockReset()
      .mockResolvedValue({ updated: 1, unchanged: 0, unknown: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks a bounced email failed and answers 200', async () => {
    const response = await post(BOUNCE);
    expect(response.status).toBe(200);
    expect(recordProviderReports).toHaveBeenCalledWith({}, 'resend', [
      {
        providerMessageId: 're_1',
        status: 'bounced',
        errorCode: 'resend_bounced',
        occurredAt: '2026-10-25T02:59:00.000Z',
      },
    ]);
  });

  it('answers 200 to an event it does not act on, and records nothing', async () => {
    const delivered = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_1' } });
    expect((await post(delivered)).status).toBe(200);
    expect(recordProviderReports).toHaveBeenCalledWith({}, 'resend', []);
  });

  it.each([
    ['a missing signature', { 'svix-signature': '' }],
    ['an invalid signature', { 'svix-signature': 'v1,AAAA' }],
    ['a stale timestamp', { 'svix-timestamp': String(Number(NOW_SECONDS) - 301) }],
  ])('answers 403 to %s and records the failure', async (_case, headers) => {
    const response = await post(BOUNCE, headers);
    expect(response.status).toBe(403);
    expect(recordSignatureFailure).toHaveBeenCalledWith({}, 'resend', 'unknown');
    expect(recordProviderReports).not.toHaveBeenCalled();
  });

  it('answers 429 past the rate limit, so Resend retries', async () => {
    vi.mocked(withinWebhookLimit).mockResolvedValue(false);
    expect((await post(BOUNCE)).status).toBe(429);
    expect(recordProviderReports).not.toHaveBeenCalled();
  });

  it('answers 400 to a signed body of another shape and 413 to one over 64 KB', async () => {
    expect((await post('{"type":"email.bounced"}')).status).toBe(400);
    expect((await post(' '.repeat(65_537))).status).toBe(413);
  });

  it('answers 503 when the database is out of reach, so Resend retries', async () => {
    vi.mocked(recordProviderReports).mockRejectedValue(new Error('down'));
    expect((await post(BOUNCE)).status).toBe(503);
  });
});
