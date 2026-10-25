import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { ProviderReport } from '@/types/provider-report';

// Task P3.11.09 (docs/Security.md §10.2, EP-03, APP-12): Resend's webhook, signed the Svix way. The signature is the
// HMAC-SHA256 of `id.timestamp.body` under the secret's key, base64, among the space-separated `v1,<signature>`
// entries of svix-signature; a timestamp more than five minutes from now is refused, so a captured request cannot be
// replayed later. Only bounces and complaints are read, and they only mark the email as failed.

const SECRET_PREFIX = 'whsec_';
const SIGNATURE_VERSION = 'v1';
export const SVIX_TOLERANCE_SECONDS = 300;
const TIMESTAMP_PATTERN = /^[0-9]{1,12}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_TYPE_LENGTH = 60;
const MAX_TIME_LENGTH = 40;
const MAX_EMAIL_ID_LENGTH = 200;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

function signingKey(secret: string): Buffer {
  return Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    'base64',
  );
}

function isFresh(timestamp: string, nowSeconds: number): boolean {
  return Math.abs(nowSeconds - Number(timestamp)) <= SVIX_TOLERANCE_SECONDS;
}

function matchesAny(signatureHeader: string, expected: Buffer): boolean {
  return signatureHeader.split(' ').some((entry) => {
    const [version, encoded] = entry.split(',');
    if (version !== SIGNATURE_VERSION || encoded === undefined) return false;
    const given = Buffer.from(encoded, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export function hasValidSvixSignature(
  headers: SvixHeaders,
  rawBody: string,
  secret: string,
  nowSeconds: number,
): boolean {
  const { id, timestamp, signature } = headers;
  if (id === null || timestamp === null || signature === null) return false;
  if (!ID_PATTERN.test(id) || !TIMESTAMP_PATTERN.test(timestamp)) return false;
  if (!isFresh(timestamp, nowSeconds)) return false;
  const expected = createHmac('sha256', signingKey(secret))
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest();
  return matchesAny(signature, expected);
}

export const resendEventSchema = z.object({
  type: z.string().min(1).max(MAX_TYPE_LENGTH),
  created_at: z.string().max(MAX_TIME_LENGTH).optional(),
  data: z.object({ email_id: z.string().min(1).max(MAX_EMAIL_ID_LENGTH) }),
});
export type ResendEvent = z.infer<typeof resendEventSchema>;

const FAILURES: Readonly<Record<string, { status: string; errorCode: string }>> = {
  'email.bounced': { status: 'bounced', errorCode: 'resend_bounced' },
  'email.complained': { status: 'complained', errorCode: 'resend_complained' },
};

// The failure a verified event reports, or null for every other event (sent, delivered, opened and the rest).
export function resendReportOf(event: ResendEvent): ProviderReport | null {
  const failure = FAILURES[event.type];
  if (failure === undefined) return null;
  const occurredAt = event.created_at === undefined ? null : new Date(event.created_at);
  return {
    providerMessageId: event.data.email_id,
    status: failure.status,
    errorCode: failure.errorCode,
    occurredAt:
      occurredAt === null || Number.isNaN(occurredAt.getTime()) ? null : occurredAt.toISOString(),
  };
}
