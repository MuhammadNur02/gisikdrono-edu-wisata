import 'server-only';

import { z } from 'zod';

import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// Typed calls to the visit-terms functions (supabase/migrations/20261102080100_visit_terms_functions.sql; docs/PRD.md
// §13.1 A16–A18), on the service-role client booking-service.ts and payment-service.ts hand in (CLAUDE.md §6.1). Every
// amount is integer rupiah.

export type RefundKind = EnumValue<'refund_request_kind'>;
type PaymentMethod = EnumValue<'payment_method'>;

const amount = z.int().nonnegative();
const FULL_PERCENT = 100;

const quoteSchema = z.looseObject({
  kind: z.enum(DB_ENUMS.refund_request_kind),
  amount,
  paid: amount,
  days_before: z.int().optional(),
  refund_pct: z.int().min(0).max(FULL_PERCENT).nullish(),
  package_refund: amount.optional(),
  addon_refund: amount.optional(),
  fee_amount: amount.optional(),
  retained: amount.optional(),
  method: z.enum(DB_ENUMS.payment_method).optional(),
});

// What the status hub shows before the visitor confirms (FR-BOOK-23): the refund and its parts, as the cancellation
// would write them now.
export interface RefundQuote {
  kind: RefundKind;
  amount: number;
  paid: number;
  daysBefore: number | null;
  refundPct: number | null;
  packageRefund: number;
  addonRefund: number;
  feeAmount: number;
  retained: number;
  method: PaymentMethod | null;
}

export async function svcRefundPreview(
  adminClient: DatabaseClient,
  request: { bookingId: string; kind: RefundKind },
): Promise<RefundQuote> {
  const reply = quoteSchema.parse(
    await resultOf(
      adminClient.rpc('svc_refund_preview', {
        p_booking_id: request.bookingId,
        p_kind: request.kind,
      }),
    ),
  );
  return {
    kind: reply.kind,
    amount: reply.amount,
    paid: reply.paid,
    daysBefore: reply.days_before ?? null,
    refundPct: reply.refund_pct ?? null,
    packageRefund: reply.package_refund ?? 0,
    addonRefund: reply.addon_refund ?? 0,
    feeAmount: reply.fee_amount ?? 0,
    retained: reply.retained ?? 0,
    method: reply.method ?? null,
  };
}

const cancelReplySchema = z.strictObject({
  result: z.literal('cancelled'),
  close_orders: z.array(z.string()),
  refund: z
    .strictObject({
      request_id: z.uuid(),
      amount: z.int().positive(),
      method: z.enum(DB_ENUMS.payment_method),
      refund_key: z.string(),
      order_id: z.string(),
    })
    .nullable(),
});

export interface CancellationOutcome {
  // The open attempts the database closed, whose orders end at Midtrans next (best effort).
  closeOrders: string[];
  // The refund the terms gave, requested and not yet paid; null for an unpaid booking or a refund of nothing.
  refund: {
    requestId: string;
    amount: number;
    method: PaymentMethod;
    refundKey: string;
    orderId: string;
  } | null;
}

// The refund the visitor saw goes with the cancellation; the database answers PRICE_MISMATCH when its own figure has
// moved since (review of PR #69, M3).
export interface CancellationRequest {
  bookingId: string;
  reason: string;
  kind: RefundKind;
  expectedAmount: number;
  expectedPct: number | null;
}

export async function svcCancelBooking(
  adminClient: DatabaseClient,
  request: CancellationRequest,
): Promise<CancellationOutcome> {
  const reply = cancelReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_cancel_booking', {
        p_booking_id: request.bookingId,
        p_reason: request.reason,
        p_kind: request.kind,
        p_expected_amount: request.expectedAmount,
        ...(request.expectedPct === null ? {} : { p_expected_pct: request.expectedPct }),
      }),
    ),
  );
  return {
    closeOrders: reply.close_orders,
    refund: reply.refund && {
      requestId: reply.refund.request_id,
      amount: reply.refund.amount,
      method: reply.refund.method,
      refundKey: reply.refund.refund_key,
      orderId: reply.refund.order_id,
    },
  };
}

// After Midtrans' refund call: submitted when Midtrans took it, failed (with its status code) when it refused in so
// many words, requested when no answer came, so payments-poll tries again (review of PR #69, M1).
export async function svcMarkRefundRequest(
  adminClient: DatabaseClient,
  report: {
    requestId: string;
    status: 'requested' | 'submitted' | 'failed';
    statusCode: string | null;
    reason: string | null;
  },
): Promise<void> {
  await resultOf(
    adminClient.rpc('svc_mark_refund_request', {
      p_request_id: report.requestId,
      p_status: report.status,
      p_status_code: report.statusCode ?? undefined,
      p_reason: report.reason ?? undefined,
    }),
  );
}

const rescheduleReplySchema = z.strictObject({
  result: z.literal('rescheduled'),
  visit_date: z.string(),
  moves: z.int().positive(),
  moves_left: z.int().nonnegative(),
});

// Decision of 2026-10-25 on the weather, rule 3: the one leg the notice stopped moves to sessionId.
export async function svcRescheduleForWeather(
  adminClient: DatabaseClient,
  request: { bookingId: string; sessionId: string },
): Promise<{ visitDate: string; moves: number; movesLeft: number }> {
  const reply = rescheduleReplySchema.parse(
    await resultOf(
      adminClient.rpc('svc_reschedule_for_weather', {
        p_booking_id: request.bookingId,
        p_session_id: request.sessionId,
      }),
    ),
  );
  return { visitDate: reply.visit_date, moves: reply.moves, movesLeft: reply.moves_left };
}

const settledSchema = z.strictObject({
  auto_refunded: z.int().nonnegative(),
  kept: z.int().nonnegative(),
  cancelled: z.int().nonnegative(),
  held: z.int().nonnegative(),
});

// Rule 2, for payments-poll: the weather windows that closed, settled; held counts the bookings left paid for the
// superadmin while their method's Midtrans fee is not set.
export async function svcSettleLapsedWeatherLinks(
  adminClient: DatabaseClient,
  limit: number,
): Promise<z.infer<typeof settledSchema>> {
  return settledSchema.parse(
    await resultOf(adminClient.rpc('svc_settle_lapsed_weather_links', { p_limit: limit })),
  );
}

const retrySchema = z.array(
  z.strictObject({
    request_id: z.uuid(),
    status: z.enum(['requested', 'submitted']),
    refund_key: z.string(),
    order_id: z.string(),
    amount: z.int().positive(),
  }),
);

export interface RefundToRetry {
  requestId: string;
  status: 'requested' | 'submitted';
  refundKey: string;
  orderId: string;
  amount: number;
}

// The QRIS refunds payments-poll looks at again (review of PR #69, H1): last tried more than ten minutes ago.
export async function svcRefundRequestsToRetry(
  adminClient: DatabaseClient,
  limit: number,
): Promise<RefundToRetry[]> {
  const rows = retrySchema.parse(
    await resultOf(adminClient.rpc('svc_refund_requests_to_retry', { p_limit: limit })),
  );
  return rows.map((row) => ({
    requestId: row.request_id,
    status: row.status,
    refundKey: row.refund_key,
    orderId: row.order_id,
    amount: row.amount,
  }));
}
