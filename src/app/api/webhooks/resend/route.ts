import { serverEnv } from '@/lib/env';
import { createLogger, requestIdFrom } from '@/lib/logger';
import {
  hasValidSvixSignature,
  resendEventSchema,
  resendReportOf,
  type ResendEvent,
} from '@/lib/notifications/resend-webhook';
// The service role is needed because Resend's reports arrive without a user: the outbox is open to no API role, and a
// report only marks as failed the email whose Resend id it names, after its signature verified (CLAUDE.md §6.1).
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

// Task P3.11.09 (docs/Security.md §10.2, EP-03, APP-12; decision OD-4): Resend's bounce and complaint reports, signed
// the Svix way, informational only. Outside the auth middleware. 200 for processed, replayed and ignored reports and
// for unknown ones older than five minutes, 503 for an unknown one younger than that; 400, 413 and 415 for a malformed body; 403 for a missing, invalid or stale signature (CLAUDE.md §5.4); 429
// past the rate limit and 503 while the database is out of reach or the secret is not set, so Resend retries.

const WEBHOOK_BODY_LIMIT_BYTES = 65_536;
const PROVIDER = 'resend';
const MS_PER_SECOND = 1000;

const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  forbidden: 403,
  tooManyRequests: 429,
  unavailable: 503,
} as const;

type Log = ReturnType<typeof createLogger>;

const empty = (status: number) => new Response(null, { status });

function parseEvent(rawBody: string): ResendEvent | null {
  try {
    const parsed = resendEventSchema.safeParse(JSON.parse(rawBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function svixHeadersOf(headers: Headers) {
  return {
    id: headers.get('svix-id'),
    timestamp: headers.get('svix-timestamp'),
    signature: headers.get('svix-signature'),
  };
}

async function receive(request: Request, log: Log): Promise<Response> {
  const adminClient = createSupabaseAdminClient();
  const clientIp = clientIpFrom(request.headers);
  if (!(await withinWebhookLimit(adminClient, PROVIDER, clientIp))) {
    log.info('rate_limited', { limit: 'webhook_resend:ip' });
    return empty(HTTP_STATUS.tooManyRequests);
  }
  const body = await readJsonText(request, WEBHOOK_BODY_LIMIT_BYTES);
  if (!body.ok) return empty(body.status);
  const secret = serverEnv.RESEND_WEBHOOK_SECRET;
  if (secret === undefined) {
    log.error('internal_error', { route: 'webhooks/resend', reason: 'not_configured' });
    return empty(HTTP_STATUS.unavailable);
  }
  const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND);
  if (!hasValidSvixSignature(svixHeadersOf(request.headers), body.text, secret, nowSeconds)) {
    log.warn('webhook_signature_invalid', { provider: PROVIDER });
    await recordSignatureFailure(adminClient, PROVIDER, clientIp);
    return empty(HTTP_STATUS.forbidden);
  }
  const event = parseEvent(body.text);
  if (event === null) return empty(HTTP_STATUS.badRequest);
  const report = resendReportOf(event);
  const counts = await recordProviderReports(
    adminClient,
    PROVIDER,
    report === null ? [] : [report],
  );
  log.info('provider_webhook', { provider: PROVIDER, ...counts });
  // A status that arrived before the outbox recorded its message id: Resend sends it again after a 503.
  return empty(counts.freshUnknown > 0 ? HTTP_STATUS.unavailable : HTTP_STATUS.ok);
}

export async function POST(request: Request): Promise<Response> {
  const log = createLogger(requestIdFrom(request.headers));
  try {
    return await receive(request, log);
  } catch {
    log.error('internal_error', { route: 'webhooks/resend' });
    return empty(HTTP_STATUS.unavailable);
  }
}
