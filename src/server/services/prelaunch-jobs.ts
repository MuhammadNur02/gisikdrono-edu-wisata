import 'server-only';

import { svcRecordJobRun } from '@/db/rpc';
import type { DatabaseClient } from '@/db/rpc-result';

// docs/Security.md §8.9: a pre-launch build has no Midtrans account, so the jobs that only ask Midtrans about orders
// (payments-poll, reconcile-payments) skip their run. They still answer only behind CRON_SECRET, and a skip is a
// successful run: its heartbeat moves, so svc_job_health never calls the job stalled, /api/health stays 200 and no
// cron_failed event is raised for a job that has nothing to do. Launching removes the flag, and the next run works.

export const PRELAUNCH_SKIP = 'prelaunch';

type MidtransJob = 'payments-poll' | 'reconcile-payments';

// false when the heartbeat could not be written, which the route answers 503 like any run the database refused.
export async function recordPrelaunchSkip(
  adminClient: DatabaseClient,
  job: MidtransJob,
): Promise<boolean> {
  try {
    await svcRecordJobRun(adminClient, { job, succeeded: true });
    return true;
  } catch {
    return false;
  }
}
