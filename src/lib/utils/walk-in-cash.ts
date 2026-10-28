import { TZDate } from '@date-fns/tz';

import { APP_TZ } from '@/config/site';
import { sessionStartsAt } from '@/lib/utils/dates';
import type { BookingDetail } from '@/types/booking-admin';
import type { CashBooking } from '@/types/walk-in';

// When "Terima tunai" is offered (Task P4.3.10; docs/PRD.md §13.1 A9, A23): an RW admin's officer booking of their
// one RW, held and unpaid, before 23:59 WIB of its visit day. A pay link the PIC opened (a payment initiated or
// pending) does not stop it: the server ends that order first (delta review of PR #91, M-1, L-1). The page uses this
// to show the button, recordWalkInCashAction to check the booking before calling Midtrans; mark_booking_paid_manually
// checks the same itself.

const CASH_DEADLINE_HOUR = 23;
const CASH_DEADLINE_MINUTE = 59;
const OPEN_PAY_LINK: ReadonlySet<string> = new Set(['initiated', 'pending']);
const UNDER_REVIEW_OR_PAID: ReadonlySet<string> = new Set(['needs_review', 'settled']);

export function cashDeadlineOf(visitDate: string): Date {
  const [year = 0, month = 1, day = 1] = visitDate.split('-').map(Number);
  return new Date(
    new TZDate(year, month - 1, day, CASH_DEADLINE_HOUR, CASH_DEADLINE_MINUTE, APP_TZ).getTime(),
  );
}

type CashTerms = Pick<
  BookingDetail,
  | 'channel'
  | 'status'
  | 'needsReview'
  | 'rwIds'
  | 'expiresAt'
  | 'visitDateEnd'
  | 'amounts'
  | 'payments'
>;

export function isCashReceivable(booking: CashTerms, isRwAdmin: boolean, now: Date): boolean {
  if (!isRwAdmin || booking.channel !== 'admin' || booking.status !== 'pending_payment')
    return false;
  if (booking.needsReview || booking.rwIds.length !== 1 || booking.amounts === null) return false;
  if (booking.expiresAt === null || Date.parse(booking.expiresAt) <= now.getTime()) return false;
  if (now >= cashDeadlineOf(booking.visitDateEnd)) return false;
  return !booking.payments.some((payment) => UNDER_REVIEW_OR_PAID.has(payment.status));
}

// What the cash form needs of the booking: its total, its size, and when its first session starts (A23 addendum).
export function cashBookingOf(booking: BookingDetail): CashBooking | null {
  const starts = booking.legs.map((leg) =>
    sessionStartsAt(leg.sessionDate, leg.startTime).getTime(),
  );
  if (booking.amounts === null || starts.length === 0) return null;
  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    totalAmount: booking.amounts.total,
    paxCount: booking.paxCount,
    sessionStartsAt: new Date(Math.min(...starts)).toISOString(),
  };
}

// The PIC has a Midtrans order open, which taking the cash ends ("Tautan pembayaran yang terbuka akan dihentikan").
export function hasOpenPayLink(booking: Pick<BookingDetail, 'payments'>): boolean {
  return booking.payments.some((payment) => OPEN_PAY_LINK.has(payment.status));
}
