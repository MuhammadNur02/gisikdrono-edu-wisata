import 'server-only';

import { addDays } from 'date-fns';

import { RESENDABLE_TEMPLATES } from '@/config/bookings';
import { rwLabel } from '@/config/rw';
import {
  cancelBookingAsStaff,
  cancellationPreview,
  extendBookingHold,
  reactivateBooking,
  requestNotificationResend,
  resolveBookingReview,
} from '@/db/rpc-booking-staff';
import type { RefundQuote } from '@/db/rpc-terms';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { walkInCopy } from '@/lib/copy/walk-in';
import { serverEnv } from '@/lib/env';
import { AppError, raisedHintOf } from '@/lib/errors';
import { listAvailableSessions } from '@/lib/queries/sessions';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateShort, formatTimeRange, sessionStartsAt, toVisitDate } from '@/lib/utils/dates';
import type {
  CancelBookingValues,
  ExtendHoldValues,
  ResendMessageValues,
  ResolveReviewValues,
} from '@/lib/validations/booking-staff';
import { asStaffRpcStep } from '@/server/services/booking-admin-service';
import { settleCancellation } from '@/server/services/payment-service';
import type { BookingDetail } from '@/types/booking-admin';
import type { MessageHistoryEntry, ReviewLeg } from '@/types/booking-staff';

// The staff steps of /dashboard/bookings/[id] (Task P4.3.08; docs/PRD.md §13.1 A28) through the staff member's own
// session client: each RPC checks the role, the RW, AAL2 and, where it asks, the fresh TOTP again. A cancellation or a
// refunding resolution leaves its Midtrans side to payment-service.ts afterwards, as the visitor's does.

const text = bookingStaffCopy.errors;

const REFUSAL_MESSAGES: Readonly<
  Record<string, { code: 'STATE_INVALID' | 'PRICE_MISMATCH' | 'QUOTA_EXCEEDED'; message: string }>
> = {
  STATE_INVALID: { code: 'STATE_INVALID', message: text.stateInvalid },
  PRICE_MISMATCH: { code: 'PRICE_MISMATCH', message: text.priceChanged },
  QUOTA_UNAVAILABLE: { code: 'QUOTA_EXCEEDED', message: text.quotaUnavailable },
  NOT_SENT: { code: 'STATE_INVALID', message: text.notSent },
  // A resent D-1 reminder whose last row was queued before reminders carried their day (20261105140200).
  REMINDER_DAY_UNKNOWN: { code: 'STATE_INVALID', message: text.reminderDayUnknown },
  // A message other than a first payment reminder that the booking never had on that channel, and a first reminder of
  // an officer's hold whose pay link has not gone out (20261105175000).
  NEVER_SENT: { code: 'STATE_INVALID', message: text.neverSent },
  PAY_LINK_NOT_SENT: { code: 'STATE_INVALID', message: text.payLinkNotSent },
  QR_KEY_UNKNOWN: { code: 'STATE_INVALID', message: text.qrKeyUnknown },
  PAYMENT_OPEN: { code: 'STATE_INVALID', message: text.holdOpenPayment },
  LEDGER_MISSING: { code: 'STATE_INVALID', message: text.ledgerMissing },
};

// The refusals these RPCs raise with a hint, each with the sentence the page shows.
async function asBookingStep<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await asStaffRpcStep(run);
  } catch (error) {
    const refusal = REFUSAL_MESSAGES[raisedHintOf(error) ?? ''];
    if (refusal) throw new AppError(refusal.code, refusal.message);
    throw error;
  }
}

export async function previewStaffCancellation(
  bookingId: string,
  reasonCategory: string | null,
): Promise<RefundQuote> {
  const supabase = await createSupabaseServerClient();
  return asBookingStep(() => cancellationPreview(supabase, { bookingId, reasonCategory }));
}

export async function cancelBookingByStaff(values: CancelBookingValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const outcome = await asBookingStep(() => cancelBookingAsStaff(supabase, values));
  await settleCancellation(outcome);
}

// An open pay page keeps the old deadline, so the hold is extended only once it lapsed (PAYMENT_OPEN).
export async function extendHold(values: ExtendHoldValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asBookingStep(() => extendBookingHold(supabase, values));
}

export async function reactivate(bookingId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asBookingStep(() => reactivateBooking(supabase, bookingId));
}

export async function resendMessage(values: ResendMessageValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asBookingStep(() => requestNotificationResend(supabase, values));
}

// A28: a move's tickets are signed with this server's key id; a full refund goes on to Midtrans as a cancellation's.
export async function resolveReview(values: ResolveReviewValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const outcome = await asBookingStep(() =>
    resolveBookingReview(supabase, { ...values, keyId: serverEnv.QR_SIGNING_ACTIVE_KID }),
  );
  if (outcome) await settleCancellation(outcome);
}

// A28: the open sessions each leg of a booking under review may move to, from today to booking.max_advance_days
// ahead, read as the public calendar reads them (no personal data); resolve_booking_review checks them again.
export async function listReviewLegs(
  booking: BookingDetail,
  now: Date = new Date(),
): Promise<ReviewLeg[]> {
  const { maxAdvanceDays } = await getPublicSiteSettings();
  const from = toVisitDate(now);
  const to = toVisitDate(addDays(now, maxAdvanceDays));
  return Promise.all(
    booking.legs.map(async (leg) => ({
      rwLabel: rwLabel(leg.rwId),
      sessions: (await listAvailableSessions({ rwId: leg.rwId, from, to }))
        .filter(
          (session) =>
            session.remaining >= leg.pax &&
            sessionStartsAt(session.sessionDate, session.startTime) > now,
        )
        .map((session) => ({
          value: session.id,
          label: walkInCopy.sessionOption(
            formatDateShort(session.sessionDate),
            formatTimeRange(session.startTime, session.endTime),
            session.remaining,
          ),
        })),
    })),
  );
}

// The PIC's messages of a booking the staff member sees, for the "Kirim pesan" sheet: the notifications RLS shows of
// a booking in scope, by the columns granted to staff (0005: never the recipient or the parameters).
export async function listMessageHistory(bookingId: string): Promise<MessageHistoryEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('template, channel, status, created_at')
    .eq('booking_id', bookingId)
    .in('template', RESENDABLE_TEMPLATES);
  if (error) throw error;
  return data.map((message) => ({
    template: message.template,
    channel: message.channel,
    status: message.status,
    createdAt: message.created_at,
  }));
}
