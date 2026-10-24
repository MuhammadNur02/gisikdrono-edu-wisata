import 'server-only';

import { svcJobHealth, svcPlaceholderSiteSettings } from '@/db/rpc-health';
import type { DatabaseClient } from '@/db/rpc-result';

// Task P3.11.07 (docs/Security.md OPS-06, RES-02, OPS-03): what GET /api/health reports to the uptime monitor, on the
// service-role client notification-service.ts hands in. Counts only: no job name, setting key or row leaves the
// server, so the answer tells a stranger nothing but up or down.

// A message waiting this long past its send time, 15 minutes, means the worker is not getting through.
const OVERDUE_AFTER_MS = 900_000;

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    stalledJobs: number;
    overdueMessages: number;
    maintenanceMode: boolean;
    // Production only (go-live check #19): the settings still holding a seeded placeholder.
    placeholderSettings: number;
  };
}

async function countOverdueMessages(adminClient: DatabaseClient, now: Date): Promise<number> {
  const { count, error } = await adminClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .lt('next_attempt_at', new Date(now.getTime() - OVERDUE_AFTER_MS).toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function isMaintenanceMode(adminClient: DatabaseClient): Promise<boolean> {
  const { data, error } = await adminClient
    .from('site_settings')
    .select('value')
    .eq('key', 'maintenance_mode')
    .maybeSingle();
  if (error) throw error;
  return data?.value === true;
}

// Throws when the database cannot be read at all, which the route answers as down.
export async function checkServiceHealth(
  adminClient: DatabaseClient,
  isProduction: boolean,
  now: Date = new Date(),
): Promise<HealthReport> {
  const [jobs, overdueMessages, maintenanceMode, placeholders] = await Promise.all([
    svcJobHealth(adminClient),
    countOverdueMessages(adminClient, now),
    isMaintenanceMode(adminClient),
    isProduction ? svcPlaceholderSiteSettings(adminClient) : Promise.resolve([]),
  ]);
  const checks = {
    stalledJobs: jobs.filter((job) => job.isStalled).length,
    overdueMessages,
    maintenanceMode,
    placeholderSettings: placeholders.length,
  };
  const isHealthy =
    checks.stalledJobs === 0 &&
    checks.overdueMessages === 0 &&
    !checks.maintenanceMode &&
    checks.placeholderSettings === 0;
  return { status: isHealthy ? 'ok' : 'degraded', checks };
}
