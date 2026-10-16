import { randomUUID } from 'node:crypto';

import { createLogger, requestIdFrom } from '@/lib/logger';
// The service role is needed because this job runs without a signed-in user and deletes files RLS
// does not let anyone delete. It is reached only by pg_cron behind CRON_SECRET, and it touches only
// the files the retention runs marked (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hasValidCronSecret } from '@/server/auth/cron-secret';
import { purgeMarkedFiles } from '@/server/services/document-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'purge-storage';

export async function GET(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  try {
    const report = await purgeMarkedFiles(createSupabaseAdminClient());
    log.info('job_run', { job: JOB_NAME, runId, ...report });
    return Response.json({ runId, ...report });
  } catch {
    // 503 makes the next scheduled call try again; the marked rows are still there.
    log.error('cron_failed', { job: JOB_NAME, runId });
    return Response.json({ runId }, { status: 503 });
  }
}
