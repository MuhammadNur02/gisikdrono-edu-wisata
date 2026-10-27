import type { RwBadge } from '@/types/rw-unit';

// A package an officer may book at the counter (Task P4.3.10). No price: the quote gives it.
export interface WalkInPackage {
  id: string;
  name: string;
  rws: RwBadge[];
  minPax: number;
  maxPax: number;
}

// What the cash step needs of a booking: its total, its size, and when its first session starts (after it, the cash
// counts the group in, A23 addendum). ISO strings.
export interface CashBooking {
  bookingId: string;
  bookingCode: string;
  totalAmount: number;
  paxCount: number;
  sessionStartsAt: string;
}

// What createAdminBookingAction answers: the booking for the cash step, and whether the officer takes the cash now.
export interface WalkInBooking extends CashBooking {
  isCashOnTheSpot: boolean;
}
