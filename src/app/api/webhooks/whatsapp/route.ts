import type { DatabaseClient } from '@/db/rpc-result';
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
  ALL_META_LIMIT,
  recordProviderReports,
  recordSignatureFailure,
  SENDER_LIMIT_OF,
  withinAllMetaLimit,
  withinSenderLimit,
} from '@/server/services/provider-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Task P3.11.06 (docs/Security.md §10.1, EP-01): Meta's subscription handshake and delivery reports. Outside the auth
// middleware (src/middleware.ts matcher). 200 for processed reports and for unknown ones older than five minutes, 503
// for an unknown one younger than that, whose send the outbox may not have recorded yet; 400, 413 and 415 for a malformed
// body; 403 for a bad signature and for a wrong verify token (CLAUDE.md §5.4); 429 past the rate limit and 503 while
// the database is out of reach, so Meta retries. Without an app secret (pre-launch, docs/Security.md §8.9) no report
// can be verified, so every POST answers 404 before any limit is counted, as the Midtrans route does with no account
// (security review of PR #112, L-2). Nothing here touches a booking or money.

const WEBHOOK_BODY_LIMIT_BYTES = 65_536;
const PROVIDER = 'whatsapp';

const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  tooManyRequests: 429,
  unavailable: 503,
} as const;

type Log = ReturnType<typeof createLogger>;

const empty = (status: number) => new Response(null, { status });

// A pre-launch production may hold no verify token yet (src/lib/env.ts), and then no handshake can pass.
export function GET(request: Request): Response {
  const verifyToken = serverEnv.WHATSAPP_VERIFY_TOKEN;
  if (verifyToken === undefined) return empty(HTTP_STATUS.forbidden);
  const challenge = verifiedChallenge(new URL(request.url).searchParams, verifyToken);
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

type Verified = { webhook: MetaWebhook } | { refusal: Response };

// The body, its signature, then Meta's shared limit: a body that did not verify never counts against it, so no
// unsigned sender can use up Meta's share (re-review of PR #70, M-2).
async function verifiedWebhook(
  request: Request,
  sender: { adminClient: DatabaseClient; clientIp: string; appSecret: string },
  log: Log,
): Promise<Verified> {
  const { adminClient, clientIp, appSecret } = sender;
  const body = await readJsonText(request, WEBHOOK_BODY_LIMIT_BYTES);
  if (!body.ok) return { refusal: empty(body.status) };
  if (!hasValidMetaSignature(body.text, request.headers.get('x-hub-signature-256'), appSecret)) {
    log.warn('webhook_signature_invalid', { provider: PROVIDER });
    await recordSignatureFailure(adminClient, PROVIDER, clientIp);
    return { refusal: empty(HTTP_STATUS.forbidden) };
  }
  if (!(await withinAllMetaLimit(adminClient))) {
    log.info('rate_limited', { limit: ALL_META_LIMIT });
    return { refusal: empty(HTTP_STATUS.tooManyRequests) };
  }
  const webhook = parseWebhook(body.text);
  return webhook === null ? { refusal: empty(HTTP_STATUS.badRequest) } : { webhook };
}

async function receive(request: Request, appSecret: string, log: Log): Promise<Response> {
  const adminClient = createSupabaseAdminClient();
  const clientIp = clientIpFrom(request.headers);
  if (!(await withinSenderLimit(adminClient, PROVIDER, clientIp))) {
    log.info('rate_limited', { limit: SENDER_LIMIT_OF[PROVIDER] });
    return empty(HTTP_STATUS.tooManyRequests);
  }
  const verified = await verifiedWebhook(request, { adminClient, clientIp, appSecret }, log);
  if ('refusal' in verified) return verified.refusal;
  const { webhook } = verified;
  const counts = await recordProviderReports(adminClient, PROVIDER, metaReportsOf(webhook));
  log.info('provider_webhook', { provider: PROVIDER, ...counts });
  // A status that arrived before the outbox recorded its message id: Meta sends it again after a 503.
  return empty(counts.freshUnknown > 0 ? HTTP_STATUS.unavailable : HTTP_STATUS.ok);
}

export async function POST(request: Request): Promise<Response> {
  const log = createLogger(requestIdFrom(request.headers));
  const appSecret = serverEnv.WHATSAPP_APP_SECRET;
  if (appSecret === undefined) {
    log.info('provider_webhook', { provider: PROVIDER, result: 'not_configured' });
    return empty(HTTP_STATUS.notFound);
  }
  try {
    return await receive(request, appSecret, log);
  } catch {
    log.error('internal_error', { route: 'webhooks/whatsapp' });
    return empty(HTTP_STATUS.unavailable);
  }
}
