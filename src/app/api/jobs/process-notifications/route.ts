import { randomUUID } from 'node:crypto';

import { svcRecordJobRun } from '@/db/rpc';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { notificationProviders } from '@/lib/notifications/providers';
// The service role is needed because this job runs without a signed-in user and the outbox and the functions that
// move it are open to no API role. It is reached only by pg_cron behind CRON_SECRET, and it touches only the rows
// internal.claim_notifications hands it (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hasValidCronSecret } from '@/server/auth/cron-secret';
import { processNotifications } from '@/server/services/notification-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'process-notifications';
const RUN_FAILED = 'run_failed';

// One batch of the outbox every minute (0007_cron.sql). A message that fails stays in the outbox with its retry
// time, so a run that delivered some and not others still counts as a successful run; only a run that could not work
// the outbox at all is a failure, which /api/health then sees in the heartbeat.
export async function POST(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  const adminClient = createSupabaseAdminClient();
  try {
    const run = await processNotifications(adminClient, notificationProviders());
    await svcRecordJobRun(adminClient, { job: JOB_NAME, succeeded: true });
    log.info('job_run', { job: JOB_NAME, runId, ...run });
    return Response.json({ runId, ...run });
  } catch {
    log.error('cron_failed', { job: JOB_NAME, runId });
    await svcRecordJobRun(adminClient, {
      job: JOB_NAME,
      succeeded: false,
      errorCode: RUN_FAILED,
    }).catch(() => {
      log.error('cron_failed', { job: JOB_NAME, runId, heartbeat: 'not_recorded' });
    });
    return Response.json({ runId }, { status: 503 });
  }
}
