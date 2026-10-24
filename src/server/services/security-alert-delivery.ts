import 'server-only';

import { svcClaimSecurityAlerts, svcReleaseSecurityAlert } from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import { displayParams } from '@/lib/notifications/compose';
import type { NotificationProvider } from '@/lib/notifications/types';
import { publicEnv } from '@/lib/public-env';

// Task P3.11.08 (docs/Security.md OPS-06, MON-03): high and critical alerts go to SECURITY_ALERT_EMAIL by the email
// provider directly, not through the outbox, so a stalled outbox cannot silence them. The process-notifications job
// hands in its service-role client. An alert carries its rule, severity and time only: its details stay on the
// dashboard. Not even email_enabled holds them back: that switch is for the site's own messages, and an alert must
// reach the operator whatever else is off. WhatsApp to SECURITY_ALERT_WA_PHONE waits for the kelurahan's own number.

const ALERT_BATCH_SIZE = 10;
const SECURITY_ALERTS_PATH = '/dashboard/security-alerts';

export async function deliverSecurityAlerts(
  adminClient: DatabaseClient,
  email: NotificationProvider,
  recipient: string,
): Promise<number> {
  const alerts = await svcClaimSecurityAlerts(adminClient, ALERT_BATCH_SIZE);
  const results = await Promise.all(
    alerts.map(async (alert) => {
      const result = await email.send({
        notificationId: alert.id,
        channel: 'email',
        template: 'security_alert',
        recipient,
        bodyParams: displayParams({
          severity: alert.severity,
          rule: alert.rule,
          time: alert.lastSeenAt,
        }),
        link: {
          url: `${publicEnv.NEXT_PUBLIC_SITE_URL}${SECURITY_ALERTS_PATH}`,
          buttonSuffix: null,
        },
      });
      if (!result.ok) await svcReleaseSecurityAlert(adminClient, alert.id);
      return result.ok;
    }),
  );
  return results.filter((isSent) => isSent).length;
}
