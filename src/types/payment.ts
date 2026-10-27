import type { EnumValue } from '@/db/enums';

// The payment page's data (Task P3.7.04). Props for client components, so dates travel as ISO strings.

export type PaymentStatus = EnumValue<'payment_status'>;
export type PaymentMethod = EnumValue<'payment_method'>;

export interface OpenPaymentAttempt {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  redirectUrl: string | null;
  // When the attempt's Snap page closes: the hold's deadline, capped at 24 hours (delta review of PR #91, M-A).
  pageExpiresAt: string | null;
  createdAt: string;
}

export interface PaymentSession {
  rwName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

export interface PaymentPageView {
  bookingCode: string;
  status: EnumValue<'booking_status'>;
  packageName: string;
  paxCount: number;
  totalAmount: number;
  // The hold's deadline, written once; null only for a booking that never held seats.
  expiresAt: string | null;
  needsReview: boolean;
  sessions: PaymentSession[];
  // The last attempt, open or closed; null before the first one.
  payment: {
    status: PaymentStatus;
    method: PaymentMethod | null;
    vaBank: string | null;
    vaNumber: string | null;
  } | null;
}
