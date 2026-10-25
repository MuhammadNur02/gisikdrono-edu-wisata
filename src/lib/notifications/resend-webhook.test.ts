import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  hasValidSvixSignature,
  resendEventSchema,
  resendReportOf,
  SVIX_TOLERANCE_SECONDS,
} from '@/lib/notifications/resend-webhook';

const KEY = Buffer.from('kunci-uji-resend-32-byte-panjang!');
const SECRET = `whsec_${KEY.toString('base64')}`;
const NOW = 1_792_900_000;
const ID = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W';
const BODY = '{"type":"email.bounced","data":{"email_id":"re_1"}}';

function signature(id: string, timestamp: string, body: string, key = KEY): string {
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

const headers = (
  overrides: Partial<{
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  }> = {},
) => ({
  id: ID,
  timestamp: String(NOW),
  signature: `v1,${signature(ID, String(NOW), BODY)}`,
  ...overrides,
});

describe('hasValidSvixSignature', () => {
  it('accepts the signature of id, timestamp and raw body under the secret', () => {
    expect(hasValidSvixSignature(headers(), BODY, SECRET, NOW)).toBe(true);
  });

  it('accepts it among several entries, as during a secret rotation', () => {
    const entries = `v1,${Buffer.from('lama').toString('base64')} ${headers().signature ?? ''}`;
    expect(hasValidSvixSignature(headers({ signature: entries }), BODY, SECRET, NOW)).toBe(true);
  });

  it.each([
    ['a missing id', headers({ id: null })],
    ['a missing timestamp', headers({ timestamp: null })],
    ['a missing signature', headers({ signature: null })],
    [
      'another key',
      headers({
        signature: `v1,${signature(ID, String(NOW), BODY, Buffer.from('lain'))}`,
      }),
    ],
    ['another version', headers({ signature: headers().signature?.replace('v1,', 'v2,') ?? null })],
    ['an id with odd characters', headers({ id: '../x' })],
  ])('refuses %s', (_case, given) => {
    expect(hasValidSvixSignature(given, BODY, SECRET, NOW)).toBe(false);
  });

  it('refuses another body', () => {
    expect(hasValidSvixSignature(headers(), `${BODY} `, SECRET, NOW)).toBe(false);
  });

  it('refuses a timestamp more than five minutes away, so a captured request cannot be replayed later', () => {
    const late = NOW + SVIX_TOLERANCE_SECONDS + 1;
    expect(hasValidSvixSignature(headers(), BODY, SECRET, late)).toBe(false);
    expect(hasValidSvixSignature(headers(), BODY, SECRET, NOW + SVIX_TOLERANCE_SECONDS)).toBe(true);
  });
});

describe('resendReportOf', () => {
  it.each([
    ['email.bounced', 'bounced', 'resend_bounced'],
    ['email.complained', 'complained', 'resend_complained'],
  ])('reads %s as a failure of the email', (type, status, errorCode) => {
    const event = resendEventSchema.parse({
      type,
      created_at: '2026-10-25T03:00:00.000Z',
      data: { email_id: 're_1' },
    });
    expect(resendReportOf(event)).toEqual({
      providerMessageId: 're_1',
      status,
      errorCode,
      occurredAt: '2026-10-25T03:00:00.000Z',
    });
  });

  it('ignores every other event', () => {
    const event = resendEventSchema.parse({ type: 'email.delivered', data: { email_id: 're_1' } });
    expect(resendReportOf(event)).toBeNull();
  });

  it('leaves an unreadable time to the database', () => {
    const event = resendEventSchema.parse({
      type: 'email.bounced',
      created_at: 'kemarin',
      data: { email_id: 're_1' },
    });
    expect(resendReportOf(event)?.occurredAt).toBeNull();
  });
});
