import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The anomaly scan's run (Task P4.10.01, 20261029080100), on the service-role client of api/jobs/anomaly-scan.

const anomalyReportSchema = z
  .object({ raised: z.number().int().nonnegative(), chains_checked: z.boolean() })
  .strict();

export interface AnomalyReport {
  // Alerts raised or seen again by this run.
  raised: number;
  chainsChecked: boolean;
}

export async function svcRunAnomalyScan(
  adminClient: DatabaseClient,
  options: { checkChains: boolean },
): Promise<AnomalyReport> {
  const report = anomalyReportSchema.parse(
    await resultOf(
      adminClient.rpc('svc_run_anomaly_scan', { p_check_chains: options.checkChains }),
    ),
  );
  return { raised: report.raised, chainsChecked: report.chains_checked };
}
