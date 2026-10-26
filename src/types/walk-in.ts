import type { RwBadge } from '@/types/rw-unit';

// A package an officer may book at the counter (Task P4.3.10). No price: the quote gives it.
export interface WalkInPackage {
  id: string;
  name: string;
  rws: RwBadge[];
  minPax: number;
  maxPax: number;
}

// What createAdminBookingAction answers: the booking, and its total for the cash step.
export interface WalkInBooking {
  bookingId: string;
  bookingCode: string;
  totalAmount: number;
  isCashOnTheSpot: boolean;
}
