import 'server-only';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// Typed calls behind GET /api/health (Task P3.11.07): the scheduled jobs' heartbeats (0007) and the site_settings
// still holding a seeded placeholder (0008).

export interface JobHealth {
  job: string;
  isStalled: boolean;
}

export async function svcJobHealth(adminClient: DatabaseClient): Promise<JobHealth[]> {
  const rows = await resultOf(adminClient.rpc('svc_job_health'));
  return rows.map((row) => ({ job: row.job, isStalled: row.is_stalled }));
}

export function svcPlaceholderSiteSettings(adminClient: DatabaseClient): Promise<string[]> {
  return resultOf(adminClient.rpc('svc_placeholder_site_settings'));
}
