import { randomUUID } from 'node:crypto';

import { svcRecordJobRun } from '@/db/rpc';
import { svcRunAnomalyScan } from '@/db/rpc-security';
import { createLogger, requestIdFrom } from '@/lib/logger';
// The service role is needed because this job runs without a signed-in user and reads every booking, payment,
// ticket, event and staff factor to raise security_alerts. It is reached only by pg_cron behind CRON_SECRET, and it
// writes nothing but alerts (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hasValidCronSecret } from '@/server/auth/cron-secret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'anomaly-scan';
const RUN_FAILED = 'run_failed';
// pg_cron calls every five minutes (0007); the audit and ledger chains, each a whole table, are walked in the first
// run of every hour.
const CHAIN_CHECK_MINUTES = 5;

// Task P4.10.01 (docs/Security.md §11.2): the database's rules of the anomaly scan; the alerts go out of band with
// the outbox job's alert sender. A POST, like every job route.
export async function POST(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  const adminClient = createSupabaseAdminClient();
  try {
    const checkChains = new Date().getUTCMinutes() < CHAIN_CHECK_MINUTES;
    const report = await svcRunAnomalyScan(adminClient, { checkChains });
    await svcRecordJobRun(adminClient, { job: JOB_NAME, succeeded: true });
    log.info('job_run', { job: JOB_NAME, runId, ...report });
    return Response.json({ runId, ...report });
  } catch {
    // 503 makes the next scheduled call try again; a rule's alert is raised by the next run that sees it.
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
