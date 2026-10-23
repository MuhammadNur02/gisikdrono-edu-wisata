import { createHash, timingSafeEqual } from 'node:crypto';

import { after } from 'next/server';

import type { WebhookRejectionReason } from '@/db/rpc-payments';
import { serverEnv } from '@/lib/env';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { midtransNotificationSchema, type MidtransNotification } from '@/lib/midtrans/schemas';
import { hasValidMidtransSignature } from '@/lib/midtrans/verify-signature';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import { readJsonText } from '@/lib/utils/json-body';
import { kickNotificationWorker } from '@/server/services/notification-service';
import {
  expireClosedOrders,
  processMidtransNotification,
  recordWebhookRejection,
  withinPaymentLimits,
  type NotificationOutcome,
} from '@/server/services/payment-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Task P3.8.03: Midtrans' payment notifications, in the order of CLAUDE.md §7.2 with no step skipped (docs/Security.md
// §3.3). Outside the auth middleware (src/middleware.ts matcher). 200 for processed, duplicate and ignored; 400, 413
// and 415 for a malformed body; 403 for a bad signature or merchant; 404 for a wrong path token; 429; 503 when the
// database or the Status API is out of reach, so Midtrans retries. A business rule never answers 500.

const WEBHOOK_BODY_LIMIT_BYTES = 16_384;
const ALL_SENDERS = 'all';
const PAYLOAD_TOO_LARGE = 413;

type Log = ReturnType<typeof createLogger>;

// Step 1. Both sides are hashed first, so the comparison takes the same time whatever the token's length.
function isOurPathToken(token: string): boolean {
  const sha256 = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(sha256(token), sha256(serverEnv.MIDTRANS_WEBHOOK_PATH_TOKEN));
}

// Step 5: the previous key is still accepted during a rotation's overlap (docs/Security.md §3.9).
function serverKeys(): string[] {
  const previous = serverEnv.MIDTRANS_SERVER_KEY_PREVIOUS;
  return previous === undefined
    ? [serverEnv.MIDTRANS_SERVER_KEY]
    : [serverEnv.MIDTRANS_SERVER_KEY, previous];
}

function parseNotification(rawBody: string): MidtransNotification | null {
  try {
    const parsed = midtransNotificationSchema.safeParse(JSON.parse(rawBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

interface Rejection {
  reason: WebhookRejectionReason;
  status: number;
  rawBody: string;
  notification?: MidtransNotification;
}

// Metadata only (the order id, the status code, the body's hash, the sender), never the body. A failure to record it
// changes nothing in the answer.
async function refuse(request: Request, rejection: Rejection, log: Log): Promise<Response> {
  const ip = clientIpFrom(request.headers);
  try {
    await recordWebhookRejection(
      {
        reason: rejection.reason,
        orderId: rejection.notification?.order_id ?? null,
        statusCode: rejection.notification?.status_code ?? null,
        bodySha256: createHash('sha256').update(rejection.rawBody).digest('hex'),
        ip: ip === 'unknown' ? null : ip,
        userAgent: request.headers.get('user-agent'),
      },
      rateLimitIpBucket(ip),
    );
  } catch {
    log.error('internal_error', { step: 'webhook_rejection' });
  }
  return new Response(null, { status: rejection.status });
}

// Steps 3 to 6: size, type and JSON; the schema; the signature; the merchant. The answer to refuse with, or the
// notification and its raw body once they passed them all.
async function refusalOf(
  request: Request,
  log: Log,
): Promise<{ refusal: Response } | { notification: MidtransNotification; rawBody: string }> {
  const body = await readJsonText(request, WEBHOOK_BODY_LIMIT_BYTES);
  if (!body.ok) {
    const reason = body.status === PAYLOAD_TOO_LARGE ? 'body_too_large' : 'content_type';
    return { refusal: await refuse(request, { reason, status: body.status, rawBody: '' }, log) };
  }
  const rawBody = body.text;
  const notification = parseNotification(rawBody);
  if (notification === null) {
    return {
      refusal: await refuse(request, { reason: 'schema_invalid', status: 400, rawBody }, log),
    };
  }
  if (!hasValidMidtransSignature(notification, serverKeys())) {
    log.warn('webhook_signature_invalid', { orderId: notification.order_id });
    const rejection = { reason: 'signature_invalid' as const, status: 403, rawBody, notification };
    return { refusal: await refuse(request, rejection, log) };
  }
  // docs/PRD.md §10.1 answers a foreign merchant 403; docs/Security.md §3.3 said 200, and the PRD decides (§1.2).
  if (
    notification.merchant_id !== undefined &&
    notification.merchant_id !== serverEnv.MIDTRANS_MERCHANT_ID
  ) {
    log.warn('webhook_signature_invalid', {
      orderId: notification.order_id,
      reason: 'merchant_mismatch',
    });
    const rejection = { reason: 'merchant_mismatch' as const, status: 403, rawBody, notification };
    return { refusal: await refuse(request, rejection, log) };
  }
  return { notification, rawBody };
}

// Step 11: the messages go out now rather than at the next minute, and a paid booking's other orders end at Midtrans.
function afterAnswering(outcome: NotificationOutcome): void {
  if (outcome.result === 'duplicate_delivery') return;
  after(kickNotificationWorker);
  if (outcome.closeOrders.length > 0) {
    after(() => expireClosedOrders(outcome.closeOrders));
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  if (!isOurPathToken((await params).token)) return new Response(null, { status: 404 });
  const log = createLogger(requestIdFrom(request.headers));
  try {
    // Step 2, before any other write.
    const ipBucket = rateLimitIpBucket(clientIpFrom(request.headers));
    const isWithinLimits = await withinPaymentLimits([
      { name: 'webhook_midtrans:ip', subject: ipBucket },
      { name: 'webhook_midtrans:all', subject: ALL_SENDERS },
    ]);
    if (!isWithinLimits) {
      log.warn('rate_limited', { route: 'webhook_midtrans' });
      return new Response(null, { status: 429 });
    }
    const checked = await refusalOf(request, log);
    if ('refusal' in checked) return checked.refusal;
    const outcome = await processMidtransNotification(checked.notification, checked.rawBody);
    log.info('payment_webhook', {
      orderId: checked.notification.order_id,
      ...outcomeFields(outcome),
    });
    afterAnswering(outcome);
    return Response.json({ status: outcome.result });
  } catch {
    log.error('internal_error', { route: 'webhook_midtrans' });
    return new Response(null, { status: 503 });
  }
}

function outcomeFields(outcome: NotificationOutcome): Record<string, unknown> {
  if (outcome.result === 'duplicate_delivery') return { result: outcome.result };
  return {
    result: outcome.result,
    processingResult: outcome.processingResult,
    paymentStatus: outcome.paymentStatus,
    bookingStatus: outcome.bookingStatus,
  };
}
