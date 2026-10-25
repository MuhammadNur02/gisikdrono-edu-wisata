import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { ProviderReport } from '@/types/provider-report';

// Task P3.11.06 (docs/Security.md §10.1, EP-01): Meta's webhook. The subscription handshake answers Meta's challenge
// only for our verify token; a delivery report is believed only when X-Hub-Signature-256 is the HMAC-SHA256 of the
// raw body under the app secret. Only the statuses of messages we sent are read; inbound messages are discarded.

const SIGNATURE_PREFIX = 'sha256=';
const SUBSCRIBE_MODE = 'subscribe';
// Meta's challenge is a number; anything else is not echoed back.
const CHALLENGE_PATTERN = /^[0-9]{1,32}$/;
const META_ERROR_PREFIX = 'meta_';
const MS_PER_SECOND = 1000;
// Bounds on what one body may carry; Meta batches far fewer.
const MAX_MESSAGE_ID_LENGTH = 200;
const MAX_STATUS_LENGTH = 40;
const MAX_STATUSES_PER_CHANGE = 100;
const MAX_CHANGES_PER_ENTRY = 50;
const MAX_ENTRIES = 50;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

// Both sides are hashed first, so the comparison takes the same time whatever the token's length.
function isSameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(sha256(given), sha256(expected));
}

// The challenge to echo for GET /api/webhooks/whatsapp, or null when the handshake is not ours.
export function verifiedChallenge(params: URLSearchParams, verifyToken: string): string | null {
  const challenge = params.get('hub.challenge') ?? '';
  if (params.get('hub.mode') !== SUBSCRIBE_MODE || !CHALLENGE_PATTERN.test(challenge)) return null;
  return isSameSecret(params.get('hub.verify_token') ?? '', verifyToken) ? challenge : null;
}

export function hasValidMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith(SIGNATURE_PREFIX)) return false;
  const given = Buffer.from(header.slice(SIGNATURE_PREFIX.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const statusSchema = z.object({
  id: z.string().min(1).max(MAX_MESSAGE_ID_LENGTH),
  status: z.string().min(1).max(MAX_STATUS_LENGTH),
  timestamp: z
    .string()
    .regex(/^[0-9]{1,12}$/)
    .optional(),
  errors: z.array(z.object({ code: z.number().int() })).optional(),
});

export const metaWebhookSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                statuses: z.array(statusSchema).max(MAX_STATUSES_PER_CHANGE).optional(),
              }),
            }),
          )
          .max(MAX_CHANGES_PER_ENTRY),
      }),
    )
    .max(MAX_ENTRIES),
});
export type MetaWebhook = z.infer<typeof metaWebhookSchema>;

const REPORTED_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

function reportOf(status: z.infer<typeof statusSchema>): ProviderReport | null {
  if (!REPORTED_STATUSES.has(status.status)) return null;
  const errorCode = status.errors?.[0]?.code;
  return {
    providerMessageId: status.id,
    status: status.status,
    errorCode: errorCode === undefined ? null : `${META_ERROR_PREFIX}${String(errorCode)}`,
    occurredAt:
      status.timestamp === undefined
        ? null
        : new Date(Number(status.timestamp) * MS_PER_SECOND).toISOString(),
  };
}

// The delivery reports of a verified body, in the order Meta sent them; statuses Meta adds later are skipped.
export function metaReportsOf(webhook: MetaWebhook): ProviderReport[] {
  return webhook.entry
    .flatMap((entry) => entry.changes)
    .flatMap((change) => change.value.statuses ?? [])
    .flatMap((status) => reportOf(status) ?? []);
}
