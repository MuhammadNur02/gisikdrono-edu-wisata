import { NO_SEATS_REVIEW_REASON } from '@/config/bookings';
import type { BookingDetail } from '@/types/booking-admin';

// Which staff steps /dashboard/bookings/[id] offers (Task P4.3.08; docs/PRD.md §13.1 A28). Only whether a button
// shows: every RPC checks the role, the RW, the state and the fresh code again.

export interface StaffSteps {
  cancel: boolean;
  extend: boolean;
  reactivate: boolean;
  resend: boolean;
  resolveReview: boolean;
}

type StepBooking = Pick<
  BookingDetail,
  'status' | 'needsReview' | 'reviewReason' | 'expiresAt' | 'payments' | 'isAnonymised'
>;

const UNPAID: ReadonlySet<string> = new Set(['quoted', 'pending_payment']);
const OPEN_PAYMENT: ReadonlySet<string> = new Set(['initiated', 'pending', 'needs_review']);
const NO_STEPS: StaffSteps = {
  cancel: false,
  extend: false,
  reactivate: false,
  resend: false,
  resolveReview: false,
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

function canResolveReview(booking: StepBooking, isSuperadmin: boolean): boolean {
  return (
    isSuperadmin &&
    booking.status === 'paid' &&
    booking.needsReview &&
    booking.reviewReason === NO_SEATS_REVIEW_REASON
  );
}

export function staffStepsFor(
  booking: StepBooking,
  staff: { isSuperadmin: boolean; isAal2: boolean },
  now: Date,
): StaffSteps {
  if (!staff.isAal2 || booking.isAnonymised) return NO_STEPS;
  return {
    cancel: canCancel(booking, staff.isSuperadmin),
    extend: canExtend(booking, now),
    reactivate: booking.status === 'expired' && !booking.needsReview,
    resend: booking.status !== 'quoted',
    resolveReview: canResolveReview(booking, staff.isSuperadmin),
  };
}
