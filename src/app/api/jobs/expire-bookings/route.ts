import { randomUUID } from 'node:crypto';

import { svcExpireStaleBookings } from '@/db/rpc';
import { createLogger, requestIdFrom } from '@/lib/logger';
// The service role is needed because this job runs without a signed-in user and moves booking statuses and quota,
// which only internal.expire_stale_bookings may write. It is reached only behind CRON_SECRET, and it expires only the
// holds and quotations that function finds lapsed (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hasValidCronSecret } from '@/server/auth/cron-secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'expire-bookings';

// Task P3.4.04: the HTTP backstop of the pg_cron job expire_stale_bookings, which stays the primary every five
// minutes. It records no heartbeat: job_heartbeats watches that pg_cron job, and a run from here must not hide one that
// stopped. A booking that fails to expire is rolled back on its own inside the function and reported as cron_failed.
// A POST, like every job route: a run changes bookings, so nothing that repeats GETs may start one.
export async function POST(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  try {
    const report = await svcExpireStaleBookings(createSupabaseAdminClient());
    log.info('job_run', { job: JOB_NAME, runId, ...report });
    return Response.json({ runId, ...report });
  } catch {
    // 503 makes the caller try again; nothing expired, since the function runs in one transaction.
    log.error('cron_failed', { job: JOB_NAME, runId });
    return Response.json({ runId }, { status: 503 });
  }
}
