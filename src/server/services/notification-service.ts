import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  svcClaimNotifications,
  svcCompleteNotification,
  svcFailNotification,
  type OutboxRow,
} from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import { createLogger } from '@/lib/logger';
import { SENDABLE_TEMPLATES } from '@/lib/notifications/message-text';
import { notificationProviders } from '@/lib/notifications/providers';
import { sendFailure } from '@/lib/notifications/send-result';
import type { NotificationProviders, SendResult } from '@/lib/notifications/types';
import { publicEnv } from '@/lib/public-env';
// The outbox worker runs without a user: the outbox and the functions that move it are open to no API role, and a
// guest link is minted from the booking's code and token_version, which only the service role reads for a visitor.
// Every row it touches is one internal.claim_notifications handed it, and every booking it reads is the one that row
// names (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { composeMessage } from '@/server/services/outbox-messages';
import { checkServiceHealth, type HealthReport } from '@/server/services/service-health';

// The worker's one step (Task P3.11.05): claim due messages, give each its parameters and guest link, hand it to the
// channel's provider, and record the outcome. A channel switched off in site_settings has its messages cancelled
// before the claim (20261024120000), so its provider is never called.

export const OUTBOX_BATCH_SIZE = 20;
const MS_PER_SECOND = 1000;

async function attemptSend(
  adminClient: DatabaseClient,
  providers: NotificationProviders,
  row: OutboxRow,
  nowSeconds: number,
): Promise<SendResult> {
  try {
    const composed = await composeMessage(adminClient, row, nowSeconds);
    return composed.ok ? await providers[row.channel].send(composed.message) : composed.failure;
  } catch {
    return sendFailure('compose_failed', 'The message could not be prepared', false);
  }
}

async function deliver(
  adminClient: DatabaseClient,
  providers: NotificationProviders,
  row: OutboxRow,
  nowSeconds: number,
): Promise<boolean> {
  const result = await attemptSend(adminClient, providers, row, nowSeconds);
  if (result.ok) {
    await svcCompleteNotification(adminClient, {
      id: row.id,
      providerMessageId: result.providerMessageId,
    });
    return true;
  }
  const { errorCode, error, isPermanent } = result;
  await svcFailNotification(adminClient, { id: row.id, errorCode, error, isPermanent });
  return false;
}

export interface OutboxRun {
  processed: number;
  failed: number;
}

export async function processNotifications(
  adminClient: DatabaseClient,
  providers: NotificationProviders,
  nowSeconds: number = Math.floor(Date.now() / MS_PER_SECOND),
): Promise<OutboxRun> {
  const batch = await svcClaimNotifications(adminClient, {
    limit: OUTBOX_BATCH_SIZE,
    templates: SENDABLE_TEMPLATES,
  });
  const delivered = await Promise.all(
    batch.map((row) => deliver(adminClient, providers, row, nowSeconds)),
  );
  return { processed: batch.length, failed: delivered.filter((isSent) => !isSent).length };
}

// The immediate kick after a visitor's request (Task P3.2.03), run in after() once the answer has gone: the message
// goes out now rather than at the next minute of pg_cron. A failure here is left for that next run.
export async function kickNotificationWorker(): Promise<void> {
  const log = createLogger(randomUUID());
  try {
    const run = await processNotifications(createSupabaseAdminClient(), notificationProviders());
    log.info('job_run', { job: 'process-notifications', source: 'kick', ...run });
  } catch {
    log.error('cron_failed', { job: 'process-notifications', source: 'kick' });
  }
}

// GET /api/health (Task P3.11.07), read with the service role since the heartbeats and the outbox are open to no API
// role.
export function readServiceHealth(): Promise<HealthReport> {
  return checkServiceHealth(createSupabaseAdminClient(), publicEnv.VERCEL_ENV === 'production');
}
