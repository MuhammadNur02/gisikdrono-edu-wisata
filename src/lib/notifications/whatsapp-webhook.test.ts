import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  hasValidMetaSignature,
  metaReportsOf,
  metaWebhookSchema,
  verifiedChallenge,
} from '@/lib/notifications/whatsapp-webhook';

const APP_SECRET = 'uji-app-secret';
const VERIFY_TOKEN = 'uji-verify-token';

const signed = (body: string, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

const handshake = (fields: Record<string, string>) => new URLSearchParams(fields);

describe('verifiedChallenge', () => {
  it('echoes the challenge of a subscribe request with our token', () => {
    const params = handshake({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1158201444',
    });
    expect(verifiedChallenge(params, VERIFY_TOKEN)).toBe('1158201444');
  });

  it.each([
    [
      'another token',
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'lain', 'hub.challenge': '1' },
    ],
    [
      'another mode',
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' },
    ],
    [
      'a challenge that is not a number',
      { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '<b>' },
    ],
    ['no token at all', { 'hub.mode': 'subscribe', 'hub.challenge': '1' }],
  ])('answers nothing for %s', (_case, fields) => {
    expect(verifiedChallenge(handshake(fields), VERIFY_TOKEN)).toBeNull();
  });
});

describe('hasValidMetaSignature', () => {
  const body = '{"object":"whatsapp_business_account","entry":[]}';

  it('accepts the HMAC of the raw body under the app secret', () => {
    expect(hasValidMetaSignature(body, signed(body), APP_SECRET)).toBe(true);
  });

  it.each([
    ['no header', null],
    ['no prefix', signed(body).slice('sha256='.length)],
    ['another secret', signed(body, 'lain')],
    ['another body', signed(`${body} `)],
    ['a truncated signature', signed(body).slice(0, 20)],
  ])('refuses %s', (_case, header) => {
    expect(hasValidMetaSignature(body, header, APP_SECRET)).toBe(false);
  });
});

describe('metaReportsOf', () => {
  const webhook = metaWebhookSchema.parse({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from: '6281300001001', text: { body: 'halo' } }],
              statuses: [
                {
                  id: 'wamid.A',
                  status: 'delivered',
                  timestamp: '1792900000',
                  recipient_id: '6281',
                },
                {
                  id: 'wamid.B',
                  status: 'failed',
                  timestamp: '1792900060',
                  errors: [{ code: 131026, title: 'x' }],
                },
                { id: 'wamid.C', status: 'deleted' },
              ],
            },
          },
          { value: {} },
        ],
      },
    ],
  });

  it('reads the statuses Meta reports, in order, and skips the rest and the inbound messages', () => {
    expect(metaReportsOf(webhook)).toEqual([
      {
        providerMessageId: 'wamid.A',
        status: 'delivered',
        errorCode: null,
        occurredAt: new Date(1792900000 * 1000).toISOString(),
      },
      {
        providerMessageId: 'wamid.B',
        status: 'failed',
        errorCode: 'meta_131026',
        occurredAt: new Date(1792900060 * 1000).toISOString(),
      },
    ]);
  });

  it('leaves the time to the database when Meta gives none', () => {
    const bare = metaWebhookSchema.parse({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.D', status: 'read' }] } }] }],
    });
    expect(metaReportsOf(bare)).toEqual([
      { providerMessageId: 'wamid.D', status: 'read', errorCode: null, occurredAt: null },
    ]);
  });
});
