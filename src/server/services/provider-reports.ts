import 'server-only';

import type { EnumValue } from '@/db/enums';
import {
  svcRecordProviderStatus,
  svcRecordWebhookSignatureFailure,
  type ProviderReportOutcome,
} from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import { withinRateLimits } from '@/lib/rate-limit';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import type { ProviderReport } from '@/types/provider-report';

// Task P3.11.06 and P3.11.09: what POST /api/webhooks/whatsapp and POST /api/webhooks/resend do once a body arrived.
// The routes hand in their service-role client (CLAUDE.md §6.1: the outbox is open to no API role); every row this
// touches is the one a verified report names by the provider's own message id.

export type WebhookProvider = 'whatsapp' | 'resend';

const CHANNEL_OF: Readonly<Record<WebhookProvider, EnumValue<'notification_channel'>>> = {
  whatsapp: 'whatsapp',
  resend: 'email',
};
const LIMIT_OF = { whatsapp: 'webhook_whatsapp:ip', resend: 'webhook_resend:ip' } as const;

export type ReportCounts = Record<ProviderReportOutcome, number>;

export function withinWebhookLimit(
  adminClient: DatabaseClient,
  provider: WebhookProvider,
  clientIp: string,
): Promise<boolean> {
  return withinRateLimits(adminClient, [
    { name: LIMIT_OF[provider], subject: rateLimitIpBucket(clientIp) },
  ]);
}

// A body whose signature did not verify: a security event, at most webhook_rejection:ip of them an hour per IP, so a
// flood of forged reports cannot flood security_events.
export async function recordSignatureFailure(
  adminClient: DatabaseClient,
  provider: WebhookProvider,
  clientIp: string,
): Promise<void> {
  const ipBucket = rateLimitIpBucket(clientIp);
  const checks = [{ name: 'webhook_rejection:ip' as const, subject: ipBucket }];
  if (!(await withinRateLimits(adminClient, checks))) return;
  await svcRecordWebhookSignatureFailure(adminClient, { provider, ipBucket });
}

// The reports of one verified body, one at a time, in the order the provider sent them, so a later report of the
// same message is applied after an earlier one.
export async function recordProviderReports(
  adminClient: DatabaseClient,
  provider: WebhookProvider,
  reports: readonly ProviderReport[],
): Promise<ReportCounts> {
  const counts: ReportCounts = { updated: 0, unchanged: 0, unknown: 0 };
  for (const report of reports) {
    const outcome = await svcRecordProviderStatus(adminClient, CHANNEL_OF[provider], report);
    counts[outcome] += 1;
  }
  return counts;
}
