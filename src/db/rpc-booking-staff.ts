import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import {
  toCancellationOutcome,
  toRefundQuote,
  type CancellationOutcome,
  type RefundQuote,
} from '@/db/rpc-terms';
import type {
  CancelBookingValues,
  ExtendHoldValues,
  ResendMessageValues,
  ResolveReviewValues,
} from '@/lib/validations/booking-staff';

// The staff steps of a booking (Task P4.3.08; 20261104220200, 20261104220300) on the staff member's own session
// client, so each RPC checks the role, the RW, AAL2 and, where it asks, the fresh TOTP itself.

export async function cancellationPreview(
  client: DatabaseClient,
  preview: { bookingId: string; reasonCategory: string | null },
): Promise<RefundQuote> {
  return toRefundQuote(
    await resultOf(
      client.rpc('cancellation_preview', {
        p_booking_id: preview.bookingId,
        ...(preview.reasonCategory === null ? {} : { p_reason_category: preview.reasonCategory }),
      }),
    ),
  );
}

export async function cancelBookingAsStaff(
  client: DatabaseClient,
  cancellation: CancelBookingValues,
): Promise<CancellationOutcome> {
  return toCancellationOutcome(
    await resultOf(
      client.rpc('cancel_booking', {
        p_booking_id: cancellation.bookingId,
        p_reason: cancellation.reason,
        p_expected_amount: cancellation.expectedAmount,
        ...(cancellation.expectedPct === null ? {} : { p_expected_pct: cancellation.expectedPct }),
        ...(cancellation.reasonCategory === null
          ? {}
          : { p_reason_category: cancellation.reasonCategory }),
      }),
    ),
  );
}

const holdReplySchema = z.looseObject({ expires_at: z.string() });

export async function extendBookingHold(
  client: DatabaseClient,
  extension: ExtendHoldValues,
): Promise<{ expiresAt: string }> {
  const reply = holdReplySchema.parse(
    await resultOf(
      client.rpc('extend_booking_hold', {
        p_booking_id: extension.bookingId,
        p_new_expires_at: extension.newExpiresAt,
      }),
    ),
  );
  return { expiresAt: reply.expires_at };
}

export async function reactivateBooking(
  client: DatabaseClient,
  bookingId: string,
): Promise<{ expiresAt: string }> {
  const reply = holdReplySchema.parse(
    await resultOf(client.rpc('reactivate_booking', { p_booking_id: bookingId })),
  );
  return { expiresAt: reply.expires_at };
}

export async function requestNotificationResend(
  client: DatabaseClient,
  resend: ResendMessageValues,
): Promise<void> {
  await resultOf(
    client.rpc('request_notification_resend', {
      p_booking_id: resend.bookingId,
      p_template: resend.template,
      p_channel: resend.channel,
    }),
  );
}

const movedReplySchema = z.looseObject({ result: z.literal('moved') });

// A28: a move answers 'moved'; a refund answers as a cancellation does, whose refund the server asks of Midtrans.
export async function resolveBookingReview(
  client: DatabaseClient,
  review: ResolveReviewValues & { keyId: string },
): Promise<CancellationOutcome | null> {
  const reply = await resultOf(
    client.rpc('resolve_booking_review', {
      p_booking_id: review.bookingId,
      p_resolution: review.resolution,
      p_reason: review.reason,
      ...(review.resolution === 'move'
        ? { p_session_ids: review.sessionIds, p_key_id: review.keyId }
        : {}),
    }),
  );
  if (review.resolution === 'move') {
    movedReplySchema.parse(reply);
    return null;
  }
  return toCancellationOutcome(reply);
}
