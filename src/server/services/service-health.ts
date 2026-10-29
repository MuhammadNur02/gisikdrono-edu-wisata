import 'server-only';

import { svcJobHealth, svcPlaceholderSiteSettings } from '@/db/rpc-health';
import type { DatabaseClient } from '@/db/rpc-result';

// Task P3.11.07 (docs/Security.md OPS-06, RES-02, OPS-03): what GET /api/health reports to the uptime monitor, on the
// service-role client notification-service.ts hands in. The route answers ok or degraded only; the counts stay in the
// server's own log.

// A message waiting this long past its send time, 15 minutes, means the worker is not getting through.
const OVERDUE_AFTER_MS = 900_000;
// A message given up on within the last hour, 60 minutes, for a fault of the server's own, still says delivery is
// broken. Only those count (independent review of PR #50): credentials a provider refuses, a message the worker could
// not compose, one left sending by a worker that stopped. A recipient's fault (a number not on WhatsApp, an address a
// template refuses) is one visitor's, and anyone could cause one at will.
const RECENTLY_DEAD_MS = 3_600_000;
export const SERVER_FAULT_ERRORS = [
  'meta_190',
  'http_401',
  'compose_failed',
  'stuck_sending',
] as const;

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    stalledJobs: number;
    overdueMessages: number;
    deadMessages: number;
    maintenanceMode: boolean;
    // Production only (go-live check #19): the settings still holding a seeded placeholder.
    placeholderSettings: number;
    // Delta review of PR #91, L-4: QR_SIGNING_ACTIVE_KID is not in site_settings qr.signing_kids, so every ticket
    // the cash or a settlement would issue is refused.
    unknownQrKid: boolean;
    // Pre-launch only (docs/Security.md §8.9): booking_enabled or whatsapp_enabled is not off. The code keeps booking
    // closed and holds the outbox anyway; the switches are the second layer the runbook turns off.
    prelaunchSwitchOn: boolean;
  };
}

// Waiting or failing and not given up on, past its send time (independent review of PR #50, M3): a worker that is
// not running leaves messages overdue, and a provider refusing every message leaves them failing.
async function countOverdueMessages(adminClient: DatabaseClient, now: Date): Promise<number> {
  const { count, error } = await adminClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'failed'])
    .is('dead_at', null)
    .lt('next_attempt_at', new Date(now.getTime() - OVERDUE_AFTER_MS).toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function countRecentlyDeadMessages(adminClient: DatabaseClient, now: Date): Promise<number> {
  const { count, error } = await adminClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .in('last_error_code', [...SERVER_FAULT_ERRORS])
    .gt('dead_at', new Date(now.getTime() - RECENTLY_DEAD_MS).toISOString());
  if (error) throw error;
  return count ?? 0;
}

const MAINTENANCE_KEY = 'maintenance_mode';
const QR_KIDS_KEY = 'qr.signing_kids';
const PRELAUNCH_OFF_KEYS = ['booking_enabled', 'whatsapp_enabled'] as const;

interface SettingsHealth {
  maintenanceMode: boolean;
  unknownQrKid: boolean;
  prelaunchSwitchOn: boolean;
}

interface HealthEnvironment {
  isProduction: boolean;
  isPrelaunch: boolean;
  activeQrKid: string;
}

async function readSettingsHealth(
  adminClient: DatabaseClient,
  environment: HealthEnvironment,
): Promise<SettingsHealth> {
  const { data, error } = await adminClient
    .from('site_settings')
    .select('key, value')
    .in('key', [MAINTENANCE_KEY, QR_KIDS_KEY, ...PRELAUNCH_OFF_KEYS]);
  if (error) throw error;
  const valueOf = (key: string) => data.find((setting) => setting.key === key)?.value;
  const kids = valueOf(QR_KIDS_KEY);
  return {
    maintenanceMode: valueOf(MAINTENANCE_KEY) === true,
    unknownQrKid: !(Array.isArray(kids) && kids.includes(environment.activeQrKid)),
    // A switch whose row is missing counts as on: only a stored false is off.
    prelaunchSwitchOn:
      environment.isPrelaunch && PRELAUNCH_OFF_KEYS.some((key) => valueOf(key) !== false),
  };
}

function isHealthy(checks: HealthReport['checks']): boolean {
  return (
    checks.stalledJobs === 0 &&
    checks.overdueMessages === 0 &&
    checks.deadMessages === 0 &&
    !checks.maintenanceMode &&
    checks.placeholderSettings === 0 &&
    !checks.unknownQrKid &&
    !checks.prelaunchSwitchOn
  );
}

// Throws when the database cannot be read at all, which the route answers as down.
export async function checkServiceHealth(
  adminClient: DatabaseClient,
  environment: HealthEnvironment,
  now: Date = new Date(),
): Promise<HealthReport> {
  const [jobs, overdueMessages, deadMessages, settings, placeholders] = await Promise.all([
    svcJobHealth(adminClient),
    countOverdueMessages(adminClient, now),
    countRecentlyDeadMessages(adminClient, now),
    readSettingsHealth(adminClient, environment),
    environment.isProduction ? svcPlaceholderSiteSettings(adminClient) : Promise.resolve([]),
  ]);
  const checks = {
    stalledJobs: jobs.filter((job) => job.isStalled).length,
    overdueMessages,
    deadMessages,
    maintenanceMode: settings.maintenanceMode,
    placeholderSettings: placeholders.length,
    unknownQrKid: settings.unknownQrKid,
    prelaunchSwitchOn: settings.prelaunchSwitchOn,
  };
  return { status: isHealthy(checks) ? 'ok' : 'degraded', checks };
}
