import { TZDate } from '@date-fns/tz';

import { APP_TZ } from '@/config/site';
import type { BookingDetail } from '@/types/booking-admin';

// When /dashboard/bookings/[id] offers "Terima tunai" (Task P4.3.10; docs/PRD.md §13.1 A9, A23): an RW admin's
// officer booking of their one RW, held and unpaid, before 23:59 WIB of its visit day. mark_booking_paid_manually
// checks the same itself; this only decides whether the button shows.

const CASH_DEADLINE_HOUR = 23;
const CASH_DEADLINE_MINUTE = 59;
const OPEN_OR_PAID = new Set(['initiated', 'pending', 'needs_review', 'settled']);

export function cashDeadlineOf(visitDate: string): Date {
  const [year = 0, month = 1, day = 1] = visitDate.split('-').map(Number);
  return new Date(
    new TZDate(year, month - 1, day, CASH_DEADLINE_HOUR, CASH_DEADLINE_MINUTE, APP_TZ).getTime(),
  );
}

type CashBooking = Pick<
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

export function isCashReceivable(booking: CashBooking, isRwAdmin: boolean, now: Date): boolean {
  if (!isRwAdmin || booking.channel !== 'admin' || booking.status !== 'pending_payment')
    return false;
  if (booking.needsReview || booking.rwIds.length !== 1 || booking.amounts === null) return false;
  if (booking.expiresAt === null || Date.parse(booking.expiresAt) <= now.getTime()) return false;
  if (now >= cashDeadlineOf(booking.visitDateEnd)) return false;
  return !booking.payments.some((payment) => OPEN_OR_PAID.has(payment.status));
}
