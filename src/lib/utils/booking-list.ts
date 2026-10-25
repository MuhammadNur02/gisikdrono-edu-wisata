import { isCalendarDate } from '@/lib/utils/attendance';

// The `?date=` of /dashboard/bookings (Task P4.3.02): a real calendar day, or no date filter at all. Pure, so the page
// and its test read the URL the same way.
export function visitDateFilterOf(requested: string | null): string | null {
  return requested !== null && isCalendarDate(requested) ? requested : null;
}
