import { serverEnv } from '@/lib/env';
import { createLogger, requestIdFrom } from '@/lib/logger';
import {
  hasValidMetaSignature,
  metaReportsOf,
  metaWebhookSchema,
  verifiedChallenge,
  type MetaWebhook,
} from '@/lib/notifications/whatsapp-webhook';
// The service role is needed because Meta's reports arrive without a user: the outbox is open to no API role, and a
// report changes only the delivery status of the message whose Meta id it names, after its signature verified
// (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { readJsonText } from '@/lib/utils/json-body';
import {
  recordProviderReports,
  recordSignatureFailure,
  withinWebhookLimit,
} from '@/server/services/provider-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Task P3.11.06 (docs/Security.md §10.1, EP-01): Meta's subscription handshake and delivery reports. Outside the auth
// middleware (src/middleware.ts matcher). 200 for processed and unknown reports; 400, 413 and 415 for a malformed
// body; 403 for a bad signature and for a wrong verify token (CLAUDE.md §5.4); 429 past the rate limit and 503 while
// the database is out of reach or the app secret is not set, so Meta retries. Nothing here touches a booking or money.

const WEBHOOK_BODY_LIMIT_BYTES = 65_536;
const PROVIDER = 'whatsapp';

const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  forbidden: 403,
  tooManyRequests: 429,
  unavailable: 503,
} as const;

type Log = ReturnType<typeof createLogger>;

const empty = (status: number) => new Response(null, { status });

export function GET(request: Request): Response {
  const challenge = verifiedChallenge(
    new URL(request.url).searchParams,
    serverEnv.WHATSAPP_VERIFY_TOKEN,
  );
  if (challenge === null) return empty(HTTP_STATUS.forbidden);
  return new Response(challenge, {
    status: HTTP_STATUS.ok,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function parseWebhook(rawBody: string): MetaWebhook | null {
  try {
    const parsed = metaWebhookSchema.safeParse(JSON.parse(rawBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function receive(request: Request, log: Log): Promise<Response> {
  const adminClient = createSupabaseAdminClient();
  const clientIp = clientIpFrom(request.headers);
  if (!(await withinWebhookLimit(adminClient, PROVIDER, clientIp))) {
    log.info('rate_limited', { limit: 'webhook_whatsapp:ip' });
    return empty(HTTP_STATUS.tooManyRequests);
  }
  const body = await readJsonText(request, WEBHOOK_BODY_LIMIT_BYTES);
  if (!body.ok) return empty(body.status);
  const appSecret = serverEnv.WHATSAPP_APP_SECRET;
  if (appSecret === undefined) {
    log.error('internal_error', { route: 'webhooks/whatsapp', reason: 'not_configured' });
    return empty(HTTP_STATUS.unavailable);
  }
  if (!hasValidMetaSignature(body.text, request.headers.get('x-hub-signature-256'), appSecret)) {
    log.warn('webhook_signature_invalid', { provider: PROVIDER });
    await recordSignatureFailure(adminClient, PROVIDER, clientIp);
    return empty(HTTP_STATUS.forbidden);
  }
  const webhook = parseWebhook(body.text);
  if (webhook === null) return empty(HTTP_STATUS.badRequest);
  const counts = await recordProviderReports(adminClient, PROVIDER, metaReportsOf(webhook));
  log.info('provider_webhook', { provider: PROVIDER, ...counts });
  return empty(HTTP_STATUS.ok);
}

export async function POST(request: Request): Promise<Response> {
  const log = createLogger(requestIdFrom(request.headers));
  try {
    return await receive(request, log);
  } catch {
    log.error('internal_error', { route: 'webhooks/whatsapp' });
    return empty(HTTP_STATUS.unavailable);
  }
}
