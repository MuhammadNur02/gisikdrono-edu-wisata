import { randomUUID } from 'node:crypto';

import { svcRecordJobRun } from '@/db/rpc';
import { createLogger, requestIdFrom } from '@/lib/logger';
// The service role is needed because this job runs without a signed-in user and moves payment and booking statuses,
// which only internal.apply_payment_event may write. It is reached only by pg_cron behind CRON_SECRET, and it asks
// Midtrans only about the orders internal.payments_to_poll lists (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hasValidCronSecret } from '@/server/auth/cron-secret';
import { pollPayments } from '@/server/services/payment-poll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'payments-poll';
const RUN_FAILED = 'run_failed';
const ORDERS_FAILED = 'orders_not_checked';

// Task P3.9.02: the pull fallback of the webhook (docs/Security.md §3.7, WH-13). A POST, like every job route
// (internal.call_job): a run moves payments, so nothing that repeats GETs may start one.
export async function POST(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  const adminClient = createSupabaseAdminClient();
  try {
    const report = await pollPayments(adminClient);
    // An order Midtrans did not answer is asked again next run, but the run counts as failed, so an outage that
    // lasts raises the job's alert instead of passing unnoticed.
    const succeeded = report.failed === 0;
    await svcRecordJobRun(adminClient, {
      job: JOB_NAME,
      succeeded,
      ...(succeeded ? {} : { errorCode: ORDERS_FAILED }),
    });
    if (succeeded) log.info('job_run', { job: JOB_NAME, runId, ...report });
    else log.error('cron_failed', { job: JOB_NAME, runId, ...report });
    return Response.json({ runId, ...report });
  } catch {
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
