import { randomUUID } from 'node:crypto';

import { svcRecordJobRun } from '@/db/rpc';
import type { DatabaseClient } from '@/db/rpc-result';
import { serverEnv } from '@/lib/env';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { notificationProviders, securityAlertProvider } from '@/lib/notifications/providers';
// The service role is needed because this job runs without a signed-in user and the outbox and the functions that
// move it are open to no API role. It is reached only by pg_cron behind CRON_SECRET, and it touches only the rows
// internal.claim_notifications hands it (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hasValidCronSecret } from '@/server/auth/cron-secret';
import { processNotifications } from '@/server/services/notification-service';
import { deliverSecurityAlerts } from '@/server/services/security-alert-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'process-notifications';
const RUN_FAILED = 'run_failed';

const NOTHING_DELIVERED = { processed: 0, failed: 0 };

// The high and critical alerts not yet sent out of band (Task P3.11.08) and one batch of the outbox, side by side, so
// an outbox that cannot be worked never holds the alerts back (independent review of PR #50, M2). Where nothing may
// be delivered (messageDelivery 'none') neither claims anything.
function deliverBoth(adminClient: DatabaseClient) {
  const alertProvider = securityAlertProvider();
  const providers = notificationProviders();
  return Promise.allSettled([
    alertProvider
      ? deliverSecurityAlerts(adminClient, alertProvider, serverEnv.SECURITY_ALERT_EMAIL)
      : Promise.resolve(0),
    providers ? processNotifications(adminClient, providers) : Promise.resolve(NOTHING_DELIVERED),
  ]);
}

// Every minute (0007_cron.sql). A message that fails stays in the outbox with its retry time, so a run that delivered
// some and not others still counts as a successful run; only a run that could not work the outbox, or could not send
// the alerts, is a failure, which /api/health then sees in the heartbeat.
export async function POST(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  const adminClient = createSupabaseAdminClient();
  try {
    const [alerts, outbox] = await deliverBoth(adminClient);
    if (alerts.status === 'rejected')
      log.error('cron_failed', { job: JOB_NAME, runId, part: 'alerts' });
    if (alerts.status === 'rejected' || outbox.status === 'rejected') throw new Error('run failed');
    await svcRecordJobRun(adminClient, { job: JOB_NAME, succeeded: true });
    log.info('job_run', { job: JOB_NAME, runId, ...outbox.value, alertsSent: alerts.value });
    return Response.json({ runId, ...outbox.value, alertsSent: alerts.value });
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
