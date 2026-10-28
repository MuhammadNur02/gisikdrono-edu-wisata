import 'server-only';

import { z } from 'zod';

import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { Json } from '@/db/types';

// Typed calls to the payment functions (supabase/migrations/20261024080000_payment_attempt_functions.sql,
// 20261024090000_payment_event_intake.sql, 20261024090100_apply_payment_event.sql, 20261024100100_tickets_at_settlement.sql
// and 20261024100200_payments_poll.sql), on the service-role client handed in by payment-service.ts (CLAUDE.md §6.1).

type PaymentStatus = EnumValue<'payment_status'>;
type BookingStatus = EnumValue<'booking_status'>;

const attemptReplySchema = z.strictObject({
  payment_id: z.uuid(),
  order_id: z.string(),
  gross_amount: z.int().positive(),
  expires_at: z.string(),
});

export interface PaymentAttempt {
  paymentId: string;
  orderId: string;
  grossAmount: number;
  expiresAt: string;
}

// replacesPaymentId names the open attempt the caller has just expired at Midtrans (WH-16).
export async function svcCreatePaymentAttempt(
  adminClient: DatabaseClient,
  attempt: { bookingId: string; replacesPaymentId: string | null },
): Promise<PaymentAttempt> {
  const reply = attemptReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_create_payment_attempt', {
        p_booking_id: attempt.bookingId,
        p_replaces: attempt.replacesPaymentId ?? undefined,
      }),
    ),
  );
  return {
    paymentId: reply.payment_id,
    orderId: reply.order_id,
    grossAmount: reply.gross_amount,
    expiresAt: reply.expires_at,
  };
}

export function svcAttachSnapToken(
  adminClient: DatabaseClient,
  page: { paymentId: string; snapToken: string; redirectUrl: string },
): Promise<void> {
  return resultOf(
    adminClient.rpc('svc_attach_snap_token', {
      p_payment_id: page.paymentId,
      p_snap_token: page.snapToken,
      p_redirect_url: page.redirectUrl,
    }),
  );
}

export function svcRecordPaymentFailure(
  adminClient: DatabaseClient,
  paymentId: string,
  status: 'failed' | 'denied' | 'cancelled' | 'expired',
): Promise<void> {
  return resultOf(
    adminClient.rpc('svc_record_payment_failure', { p_payment_id: paymentId, p_status: status }),
  );
}

// Delta review of PR #91, L-1: the PIC's open order closed before an RW admin takes the cash, with the officer as actor.
export function svcCloseAttemptForCash(
  adminClient: DatabaseClient,
  paymentId: string,
  actorId: string,
): Promise<void> {
  return resultOf(
    adminClient.rpc('svc_close_attempt_for_cash', { p_payment_id: paymentId, p_actor_id: actorId }),
  );
}

const eventReplySchema = z.strictObject({
  event_id: z.int().positive(),
  is_processed: z.boolean(),
});

export type PaymentEventSource = 'webhook' | 'status_api' | 'poll';

export async function svcRecordPaymentEvent(
  adminClient: DatabaseClient,
  event: { source: PaymentEventSource; eventHash: string; payload: Json },
): Promise<{ eventId: number; isProcessed: boolean }> {
  const reply = eventReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_record_payment_event', {
        p_source: event.source,
        p_event_hash: event.eventHash,
        p_payload: event.payload,
      }),
    ),
  );
  return { eventId: reply.event_id, isProcessed: reply.is_processed };
}

export type WebhookRejectionReason =
  'body_too_large' | 'content_type' | 'schema_invalid' | 'signature_invalid' | 'merchant_mismatch';

export interface WebhookRejection {
  reason: WebhookRejectionReason;
  orderId: string | null;
  statusCode: string | null;
  bodySha256: string;
  ip: string | null;
  userAgent: string | null;
}

export function svcRecordWebhookRejection(
  adminClient: DatabaseClient,
  rejection: WebhookRejection,
): Promise<void> {
  return resultOf(
    adminClient.rpc('svc_record_webhook_rejection', {
      p_reason: rejection.reason,
      p_order_id: rejection.orderId ?? undefined,
      p_status_code: rejection.statusCode ?? undefined,
      p_body_sha256: rejection.bodySha256,
      p_ip: rejection.ip ?? undefined,
      p_user_agent: rejection.userAgent ?? undefined,
    }),
  );
}

const PAYMENT_EVENT_RESULTS = [
  'applied',
  'ignored',
  'duplicate',
  'needs_review',
  'needs_confirmation',
  'unknown_order',
  'already_processed',
] as const;

const applyReplySchema = z.looseObject({
  result: z.enum(PAYMENT_EVENT_RESULTS),
  processing_result: z.string().nullish(),
  payment_status: z.enum(DB_ENUMS.payment_status).nullish(),
  booking_status: z.enum(DB_ENUMS.booking_status).nullish(),
  close_orders: z.array(z.string()).nullish(),
});

export interface PaymentEventOutcome {
  result: (typeof PAYMENT_EVENT_RESULTS)[number];
  processingResult: string | null;
  paymentStatus: PaymentStatus | null;
  bookingStatus: BookingStatus | null;
  // Other open attempts of a booking that was just paid, whose orders are expired at Midtrans next.
  closeOrders: string[];
}

export async function svcApplyPaymentEvent(
  adminClient: DatabaseClient,
  // confirmed: the Status API's body for this order, or null before it was asked. keyId: the kid of
  // QR_SIGNING_KEYS new tickets are signed with (QR_SIGNING_ACTIVE_KID).
  event: { eventId: number; source: PaymentEventSource; confirmed: Json | null; keyId: string },
): Promise<PaymentEventOutcome> {
  const reply = applyReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_apply_payment_event', {
        p_event_id: event.eventId,
        p_source: event.source,
        p_key_id: event.keyId,
        p_confirmed: event.confirmed ?? undefined,
      }),
    ),
  );
  return {
    result: reply.result,
    processingResult: reply.processing_result ?? null,
    paymentStatus: reply.payment_status ?? null,
    bookingStatus: reply.booking_status ?? null,
    closeOrders: reply.close_orders ?? [],
  };
}

const pollRowsSchema = z.array(
  z.strictObject({ order_id: z.string(), reason: z.enum(['open', 'paid_incomplete']) }),
);

export interface OrderToPoll {
  orderId: string;
  // open: an attempt still waiting for Midtrans; paid_incomplete: a paid booking lacking a ticket or its ledger.
  reason: 'open' | 'paid_incomplete';
}

export async function svcPaymentsToPoll(
  adminClient: DatabaseClient,
  limit: number,
): Promise<OrderToPoll[]> {
  const rows = pollRowsSchema.parse(
    await resultOf(adminClient.rpc('svc_payments_to_poll', { p_limit: limit })),
  );
  return rows.map((row) => ({ orderId: row.order_id, reason: row.reason }));
}

const completionReplySchema = z.looseObject({
  result: z.enum(['applied', 'ignored', 'needs_review']),
});

// The self-heal of a paid booking the poll listed as paid_incomplete: true when a ticket or its ledger was written.
export async function svcCompletePaidOrder(
  adminClient: DatabaseClient,
  order: { orderId: string; keyId: string },
): Promise<boolean> {
  const reply = completionReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_complete_paid_order', {
        p_order_id: order.orderId,
        p_key_id: order.keyId,
      }),
    ),
  );
  return reply.result === 'applied';
}

const housekeepingSchema = z.strictObject({
  suspended: z.int().nonnegative(),
  reminded: z.int().nonnegative(),
});

// Tickets suspended on bookings that are no longer paid, and holds reminded six hours before their deadline.
export async function svcPaymentsHousekeeping(
  adminClient: DatabaseClient,
): Promise<{ suspended: number; reminded: number }> {
  return housekeepingSchema.parse(await resultOf(adminClient.rpc('svc_payments_housekeeping')));
}
