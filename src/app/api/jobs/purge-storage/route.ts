import { randomUUID } from 'node:crypto';

import { svcRecordJobRun } from '@/db/rpc';
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
const RUN_FAILED = 'run_failed';
const FILES_LEFT_BEHIND = 'files_not_deleted';

// A POST, like every job route (internal.call_job): a run deletes files, so nothing that repeats GETs may start one.
export async function POST(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  const adminClient = createSupabaseAdminClient();
  try {
    const report = await purgeMarkedFiles(adminClient);
    // A file that could not be deleted stays marked and is tried again next hour, but the run counts as failed,
    // so a file that keeps refusing raises an alert instead of lingering past its retention date unnoticed.
    if (report.failed > 0) {
      await svcRecordJobRun(adminClient, {
        job: JOB_NAME,
        succeeded: false,
        errorCode: FILES_LEFT_BEHIND,
      });
      log.error('cron_failed', { job: JOB_NAME, runId, ...report });
    } else {
      await svcRecordJobRun(adminClient, { job: JOB_NAME, succeeded: true });
      log.info('job_run', { job: JOB_NAME, runId, ...report });
    }
    return Response.json({ runId, ...report });
  } catch {
    // 503 makes the next scheduled call try again; the marked rows are still there.
    log.error('cron_failed', { job: JOB_NAME, runId });
    await svcRecordJobRun(adminClient, {
      job: JOB_NAME,
      succeeded: false,
      errorCode: RUN_FAILED,
    }).catch(() => {
      // The database is likely the reason the run failed; the stale heartbeat still trips /api/health.
      log.error('cron_failed', { job: JOB_NAME, runId, heartbeat: 'not_recorded' });
    });
    return Response.json({ runId }, { status: 503 });
  }
}
