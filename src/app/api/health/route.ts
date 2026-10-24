import { readServiceHealth } from '@/server/services/notification-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const HEALTHY = 200;
const UNAVAILABLE = 503;

// Task P3.11.07 (docs/Security.md OPS-06): the uptime monitor's address. 200 while every job keeps its heartbeat, no
// message waits past its time and the site is not in maintenance (in production also: no placeholder setting is
// left); 503 otherwise, and when the database cannot be read at all. The body carries counts, never names or secrets.
export async function GET(): Promise<Response> {
  try {
    const report = await readServiceHealth();
    return Response.json(report, {
      status: report.status === 'ok' ? HEALTHY : UNAVAILABLE,
      headers: NO_STORE,
    });
  } catch {
    return Response.json({ status: 'down' }, { status: UNAVAILABLE, headers: NO_STORE });
  }
}
