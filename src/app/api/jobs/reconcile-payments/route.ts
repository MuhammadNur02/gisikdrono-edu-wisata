import { randomUUID } from 'node:crypto';

import { svcRecordJobRun } from '@/db/rpc';
import { createLogger, requestIdFrom } from '@/lib/logger';
// The service role is needed because this job runs without a signed-in user, applies Midtrans' answers through
// internal.apply_payment_event and reads every payment, invoice, ledger row, ticket and session to write
// reconciliation_runs and reconciliation_issues. It is reached only by pg_cron behind CRON_SECRET, and it asks Midtrans
// only about the orders internal.payments_to_reconcile lists (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hasValidCronSecret } from '@/server/auth/cron-secret';
import { reconcilePayments } from '@/server/services/payment-reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'reconcile-payments';
const RUN_FAILED = 'run_failed';
const ORDERS_FAILED = 'orders_not_checked';

// Task P3.9.03: the daily reconciliation at 02:30 WIB (docs/Security.md §3.7, REC-01). A POST, like every job route
// (internal.call_job): a run applies Midtrans' answers, so nothing that repeats GETs may start one.
export async function POST(request: Request): Promise<Response> {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return new Response(null, { status: 401 });
  }

  const log = createLogger(requestIdFrom(request.headers));
  const runId = randomUUID();
  const adminClient = createSupabaseAdminClient();
  try {
    const report = await reconcilePayments(adminClient);
    // The run and its issues are written; an order nobody could check is asked again next run, but the run counts as
    // failed, so a lasting outage or backlog raises the job's alert instead of passing unnoticed.
    const succeeded = report.ordersNotChecked === 0;
    await svcRecordJobRun(adminClient, {
      job: JOB_NAME,
      succeeded,
      ...(succeeded ? {} : { errorCode: ORDERS_FAILED }),
    });
    if (!succeeded) {
      log.error('cron_failed', { job: JOB_NAME, runId, ...report });
      return Response.json({ runId, ...report }, { status: 503 });
    }
    log.info('job_run', { job: JOB_NAME, runId, ...report });
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
