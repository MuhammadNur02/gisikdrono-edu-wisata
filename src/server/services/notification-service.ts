import 'server-only';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { GUEST_BOOKING_PATH, GUEST_LINK_PARAM, GUEST_LINK_SCOPES } from '@/config/guest';
import {
  svcClaimNotifications,
  svcCompleteNotification,
  svcFailNotification,
  type OutboxRow,
} from '@/db/rpc-outbox';
import type { DatabaseClient } from '@/db/rpc-result';
import { mintGuestLink } from '@/lib/links/mint';
import { createLogger } from '@/lib/logger';
import { isSendableTemplate, SENDABLE_TEMPLATES } from '@/lib/notifications/message-text';
import { notificationProviders } from '@/lib/notifications/providers';
import { sendFailure, TEMPLATE_NOT_READY, type SendFailure } from '@/lib/notifications/send-result';
import { templateParamsSchemas } from '@/lib/notifications/templates';
import type { NotificationProviders, OutgoingMessage, SendResult } from '@/lib/notifications/types';
import { publicEnv } from '@/lib/public-env';
// The outbox worker runs without a user: the outbox and the functions that move it are open to no API role, and a
// guest link is minted from the booking's code and token_version, which only the service role reads for a visitor.
// Every row it touches is one internal.claim_notifications handed it, and every booking it reads is the one that row
// names (CLAUDE.md §6.1).
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// The worker's one step (Task P3.11.05): claim due messages, give each its parameters and guest link, hand it to the
// channel's provider, and record the outcome. Only templates the application can send yet are claimed; the rest stay
// queued until their tasks land.

export const OUTBOX_BATCH_SIZE = 20;
const MS_PER_SECOND = 1000;
// A name the guard let into the outbox but the template's own check refuses still gets a greeting.
const FALLBACK_NAME = 'Bapak/Ibu';

const linkScopeSchema = z.object({ link_scope: z.enum(GUEST_LINK_SCOPES) });
const otpParamsSchema = templateParamsSchemas.phone_otp;

type Composed = { ok: true; message: OutgoingMessage } | { ok: false; failure: SendFailure };

function refusal(errorCode: string, error: string): Composed {
  return { ok: false, failure: sendFailure(errorCode, error, true) };
}

async function linkFor(adminClient: DatabaseClient, row: OutboxRow, nowSeconds: number) {
  const scope = linkScopeSchema.safeParse(row.params);
  if (!scope.success || row.booking_id === null) return null;
  const { data, error } = await adminClient
    .from('bookings')
    .select('booking_code, token_version')
    .eq('id', row.booking_id)
    .single();
  if (error) throw error;
  const token = await mintGuestLink({
    bookingCode: data.booking_code,
    scope: scope.data.link_scope,
    tokenVersion: data.token_version,
    nowSeconds,
  });
  const buttonSuffix = `${data.booking_code}?${GUEST_LINK_PARAM}=${token}`;
  return {
    bookingCode: data.booking_code,
    link: {
      url: `${publicEnv.NEXT_PUBLIC_SITE_URL}${GUEST_BOOKING_PATH}/${buttonSuffix}`,
      buttonSuffix,
    },
  };
}

function greetingName(recipientName: string | null): string {
  return (
    templateParamsSchemas.booking_link.shape.name.safeParse(recipientName).data ?? FALLBACK_NAME
  );
}

async function compose(
  adminClient: DatabaseClient,
  row: OutboxRow,
  nowSeconds: number,
): Promise<Composed> {
  const base = {
    notificationId: row.id,
    channel: row.channel,
    template: row.template,
    recipient: row.recipient,
  };
  if (row.template === 'phone_otp') {
    const params = otpParamsSchema.safeParse(row.params);
    if (!params.success) return refusal('bad_params', 'The OTP message holds no code');
    return { ok: true, message: { ...base, bodyParams: params.data, link: null } };
  }
  const linked = await linkFor(adminClient, row, nowSeconds);
  if (!linked) return refusal('bad_params', 'The message names no booking or link scope');
  const bodyParams = { name: greetingName(row.recipient_name), booking_code: linked.bookingCode };
  return { ok: true, message: { ...base, bodyParams, link: linked.link } };
}

async function attemptSend(
  adminClient: DatabaseClient,
  providers: NotificationProviders,
  row: OutboxRow,
  nowSeconds: number,
): Promise<SendResult> {
  if (!isSendableTemplate(row.template)) return TEMPLATE_NOT_READY;
  try {
    const composed = await compose(adminClient, row, nowSeconds);
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
