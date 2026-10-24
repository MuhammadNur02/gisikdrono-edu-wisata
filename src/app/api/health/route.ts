import { headers } from 'next/headers';

import { createLogger, requestIdFrom } from '@/lib/logger';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { readServiceHealth } from '@/server/services/notification-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const HEALTHY = 200;
const TOO_MANY_REQUESTS = 429;
const UNAVAILABLE = 503;

// Task P3.11.07 (docs/Security.md OPS-06): the uptime monitor's address. 200 while every job keeps its heartbeat, no
// message waits or fails past its time, none was given up on in the last hour and the site is not in maintenance (in
// production also: no placeholder setting is left); 503 otherwise, and when the database cannot be read at all. The
// body says ok, degraded or down and nothing else; the counts go to the server's log (independent review of PR #50).
export async function GET(): Promise<Response> {
  const requestHeaders = await headers();
  const log = createLogger(requestIdFrom(requestHeaders));
  try {
    const report = await readServiceHealth(clientIpFrom(requestHeaders));
    if (report === null)
      return new Response(null, { status: TOO_MANY_REQUESTS, headers: NO_STORE });
    if (report.status !== 'ok') log.warn('health_degraded', report.checks);
    return Response.json(
      { status: report.status },
      { status: report.status === 'ok' ? HEALTHY : UNAVAILABLE, headers: NO_STORE },
    );
  } catch {
    log.error('internal_error', { source: 'health' });
    return Response.json({ status: 'down' }, { status: UNAVAILABLE, headers: NO_STORE });
  }
}
