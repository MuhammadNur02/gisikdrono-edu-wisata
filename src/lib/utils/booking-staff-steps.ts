import { NO_SEATS_REVIEW_REASON, STAFF_RESCHEDULE } from '@/config/bookings';
import { toVisitDate } from '@/lib/utils/dates';
import type { BookingDetail } from '@/types/booking-admin';

// Which staff steps /dashboard/bookings/[id] offers (Task P4.3.08; docs/PRD.md §13.1 A28). Only whether a button
// shows: every RPC checks the role, the RW, the state and the fresh code again.

export interface StaffSteps {
  cancel: boolean;
  extend: boolean;
  reactivate: boolean;
  resend: boolean;
  resolveReview: boolean;
  reschedule: boolean;
}

type StepBooking = Pick<
  BookingDetail,
  | 'status'
  | 'needsReview'
  | 'reviewReason'
  | 'expiresAt'
  | 'payments'
  | 'isAnonymised'
  | 'isPhoneVerified'
  | 'legs'
  | 'channel'
>;

const UNPAID: ReadonlySet<string> = new Set(['quoted', 'pending_payment']);
const OPEN_PAYMENT: ReadonlySet<string> = new Set(['initiated', 'pending', 'needs_review']);
const NO_STEPS: StaffSteps = {
  cancel: false,
  extend: false,
  reactivate: false,
  resend: false,
  resolveReview: false,
  reschedule: false,
};

function canExtend(booking: StepBooking, now: Date): boolean {
  return (
    booking.status === 'pending_payment' &&
    !booking.needsReview &&
    booking.expiresAt !== null &&
    Date.parse(booking.expiresAt) > now.getTime() &&
    !booking.payments.some((payment) => OPEN_PAYMENT.has(payment.status))
  );
}

function canCancel(booking: StepBooking, isSuperadmin: boolean): boolean {
  if (booking.needsReview) return false;
  return UNPAID.has(booking.status) || (booking.status === 'paid' && isSuperadmin);
}

// Review of PR #102, HIGH 1: a hold that lapsed (every leg released), never a lapsed quotation; a web booking's phone
// proven, an officer's exempt (A28, owner-delegated decision of 2026-10-28).
function canReactivate(booking: StepBooking): boolean {
  return (
    booking.status === 'expired' &&
    !booking.needsReview &&
    (booking.channel === 'admin' || booking.isPhoneVerified) &&
    booking.legs.length > 0 &&
    booking.legs.every((leg) => leg.status === 'released')
  );
}

function canResolveReview(booking: StepBooking, isSuperadmin: boolean): boolean {
  return (
    isSuperadmin &&
    booking.status === 'paid' &&
    booking.needsReview &&
    booking.reviewReason === NO_SEATS_REVIEW_REASON
  );
}

// 20261114080000: a paid leg that still holds its seats and visits after today, while the booking has moves left.
function canReschedule(booking: StepBooking, staffMoves: number, now: Date): boolean {
  const today = toVisitDate(now);
  return (
    (booking.status === 'paid' || booking.status === 'checked_in') &&
    !booking.needsReview &&
    staffMoves < STAFF_RESCHEDULE.maxMoves &&
    booking.legs.some((leg) => leg.status === 'reserved' && leg.sessionDate > today)
  );
}

export function staffStepsFor(
  booking: StepBooking,
  staff: { isSuperadmin: boolean; isAal2: boolean },
  now: Date,
  staffMoves = 0,
): StaffSteps {
  if (!staff.isAal2 || booking.isAnonymised) return NO_STEPS;
  return {
    cancel: canCancel(booking, staff.isSuperadmin),
    extend: canExtend(booking, now),
    reactivate: canReactivate(booking),
    resend: booking.status !== 'quoted',
    resolveReview: canResolveReview(booking, staff.isSuperadmin),
    reschedule: canReschedule(booking, staffMoves, now),
  };
}
