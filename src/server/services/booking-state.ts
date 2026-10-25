import type { AppRole, EnumValue } from '@/db/enums';

// docs/PRD.md §9.2: the statuses a booking may move to, and who may move it there. The pairs are the ones
// internal.bookings_status_transition holds in the database (supabase/migrations/0004_functions.sql), and
// booking-state.test.ts fails when the two disagree. Pure and kept at 100 % line coverage (CLAUDE.md §4 no. 13).

export type BookingStatus = EnumValue<'booking_status'>;

// booking_events.actor_type, with 'admin' split into the two staff roles, because only a superadmin cancels a
// paid booking, records a refund or undoes a check-in.
export type BookingActor = 'visitor' | 'webhook' | 'cron' | Exclude<AppRole, 'none'>;

type ActorsByStatus = Readonly<Partial<Record<BookingStatus, readonly BookingActor[]>>>;

const CRON = ['cron'] as const;
const SUPERADMIN = ['superadmin'] as const;
const STAFF_IN_SCOPE = ['admin_rw', 'superadmin'] as const;
const VISITOR_OR_STAFF = ['visitor', ...STAFF_IN_SCOPE] as const;
// A settlement reaches internal.apply_payment_event from the Midtrans webhook, from the payments-poll job, or from
// the superadmin's "Sinkronkan dengan Midtrans"; each one is confirmed by the Status API first.
const CONFIRMED_SETTLEMENT = ['webhook', 'cron', 'superadmin'] as const;

// The rows of §9.2 that start from "—": a visitor's quotation, a visitor's hold after the WhatsApp OTP, or a walk-in
// an officer records (channel 'admin').
export const BOOKING_ENTRY_STATUSES: ActorsByStatus = {
  quoted: ['visitor'],
  pending_payment: VISITOR_OR_STAFF,
};

export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, ActorsByStatus>> = {
  quoted: {
    // "Konfirmasi & Bayar" on a quotation reserves the quota and starts the hold.
    pending_payment: ['visitor'],
    expired: CRON,
    cancelled: VISITOR_OR_STAFF,
  },
  pending_payment: {
    // mark_booking_paid_manually also lets an RW admin record cash for a walk-in (docs/PRD.md §13.1 A9).
    paid: [...CONFIRMED_SETTLEMENT, 'admin_rw'],
    expired: CRON,
    cancelled: VISITOR_OR_STAFF,
    // Money that arrived while the booking was under review goes back, whole, through record_refund once Midtrans has
    // confirmed the held payment settled (internal.midtrans_confirmed_settled; review of PR #68, M5).
    refunded: SUPERADMIN,
  },
  expired: {
    // A late settlement takes the quota again, or leaves the booking paid and under review.
    paid: CONFIRMED_SETTLEMENT,
    // reactivate_booking.
    pending_payment: STAFF_IN_SCOPE,
  },
  paid: {
    // The RW admin at the gate; a superadmin may override.
    checked_in: STAFF_IN_SCOPE,
    no_show: CRON,
    cancelled: SUPERADMIN,
    refunded: SUPERADMIN,
  },
  checked_in: {
    completed: CRON,
    // A refund after partial attendance.
    refunded: SUPERADMIN,
    // undo_check_in, within 15 minutes.
    paid: SUPERADMIN,
  },
  completed: { refunded: SUPERADMIN },
  no_show: { refunded: SUPERADMIN },
  cancelled: { refunded: SUPERADMIN },
  refunded: {},
};

export function canOpenBooking(status: BookingStatus, actor: BookingActor): boolean {
  return BOOKING_ENTRY_STATUSES[status]?.includes(actor) ?? false;
}

// Staying in the same status (a new payment attempt, a longer hold, the second leg of a combo checked in) is not a
// transition, as in internal.bookings_status_transition, so it answers false.
export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActor,
): boolean {
  return BOOKING_TRANSITIONS[from][to]?.includes(actor) ?? false;
}
