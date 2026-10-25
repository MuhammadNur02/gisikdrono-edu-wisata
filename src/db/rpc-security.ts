import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The anomaly scan's run and the chain check (Task P4.10.01, 20261029080100, 20261029080200), on the service-role
// client of api/jobs/anomaly-scan.

const raisedSchema = z.object({ raised: z.number().int().nonnegative() }).strict();

// How many alerts the call raised or saw again.
export interface AnomalyReport {
  raised: number;
}

export async function svcRunAnomalyScan(adminClient: DatabaseClient): Promise<AnomalyReport> {
  return raisedSchema.parse(await resultOf(adminClient.rpc('svc_run_anomaly_scan')));
}

export async function svcRunChainCheck(adminClient: DatabaseClient): Promise<AnomalyReport> {
  return raisedSchema.parse(await resultOf(adminClient.rpc('svc_run_chain_check')));
}
