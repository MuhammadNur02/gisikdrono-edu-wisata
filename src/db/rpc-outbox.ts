import 'server-only';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { Database } from '@/db/types';

// Typed calls to the outbox worker's functions (supabase/migrations/20261021100200_notification_worker_functions.sql),
// on the service-role client of api/jobs/process-notifications and its after() kicks.

type Enums = Database['public']['Enums'];
export type OutboxRow = Database['public']['Tables']['notifications']['Row'];

export function svcClaimNotifications(
  adminClient: DatabaseClient,
  claim: { limit: number; templates: readonly Enums['notification_template'][] },
): Promise<OutboxRow[]> {
  return resultOf(
    adminClient.rpc('svc_claim_notifications', {
      p_limit: claim.limit,
      p_templates: [...claim.templates],
    }),
  );
}

export async function svcCompleteNotification(
  adminClient: DatabaseClient,
  sent: { id: string; providerMessageId: string },
): Promise<void> {
  await resultOf(
    adminClient.rpc('svc_complete_notification', {
      p_id: sent.id,
      p_provider_message_id: sent.providerMessageId,
    }),
  );
}

// errorCode and error are the server's own words, never the provider's text, which may repeat the recipient.
export async function svcFailNotification(
  adminClient: DatabaseClient,
  failure: { id: string; errorCode: string; error: string; isPermanent: boolean },
): Promise<void> {
  await resultOf(
    adminClient.rpc('svc_fail_notification', {
      p_id: failure.id,
      p_error_code: failure.errorCode,
      p_error: failure.error,
      p_permanent: failure.isPermanent,
    }),
  );
}

export type SecurityAlertToSend = {
  id: string;
  rule: string;
  severity: Enums['alert_severity'];
  lastSeenAt: string;
};

// High and critical alerts not yet sent out of band, stamped as sent as they are claimed (Task P3.11.08).
export async function svcClaimSecurityAlerts(
  adminClient: DatabaseClient,
  limit: number,
): Promise<SecurityAlertToSend[]> {
  const rows = await resultOf(adminClient.rpc('svc_claim_security_alerts', { p_limit: limit }));
  return rows.map((row) => ({
    id: row.id,
    rule: row.rule,
    severity: row.severity,
    lastSeenAt: row.last_seen_at,
  }));
}

// An alert whose email did not go out, given back to the next run.
export async function svcReleaseSecurityAlert(
  adminClient: DatabaseClient,
  id: string,
): Promise<void> {
  await resultOf(adminClient.rpc('svc_release_security_alert', { p_id: id }));
}
