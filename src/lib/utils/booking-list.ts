import { BOOKINGS_DASHBOARD_PATH, UNDER_REVIEW_VIEW } from '@/config/bookings';
import { isCalendarDate } from '@/lib/utils/attendance';
import type { BookingViewKey } from '@/types/booking-admin';

// The `?date=` of /dashboard/bookings (Task P4.3.02): a real calendar day, or no date filter at all. Pure, so the page
// and its test read the URL the same way.
export function visitDateFilterOf(requested: string | null): string | null {
  return requested !== null && isCalendarDate(requested) ? requested : null;
}

// The same list address without its page number, every other filter kept (review of PR #76, F-76-3).
export function firstPageAddress(
  path: string,
  params: Readonly<Record<string, string | string[] | undefined>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item);
  }
  const query = search.toString();
  return query === '' ? path : `${path}?${query}`;
}

// The view tabs above the list (Dasbor Gelap): which one the URL's filters are, and the address of each. A view is the
// whole filter, so a tab drops the others and keeps only the superadmin's RW.
interface ViewFilters {
  status: readonly string[];
  category: string | null;
  date: string | null;
  q: string;
}

const STATUS_VIEWS = ['pending_payment', 'paid', 'completed'] as const;

export function activeBookingView(filters: ViewFilters, today: string): BookingViewKey | null {
  const onlyStatus = filters.status.length === 1 ? filters.status[0] : undefined;
  const others = [
    filters.category !== null,
    filters.date !== null,
    filters.status.length > 0,
    filters.q !== '',
  ];
  const extras = others.filter(Boolean).length;
  if (extras === 0) return 'all';
  if (extras !== 1) return null;
  if (filters.category === UNDER_REVIEW_VIEW) return 'under_review';
  if (filters.date === today) return 'today';
  return STATUS_VIEWS.find((status) => status === onlyStatus) ?? null;
}

export function bookingViewHref(view: BookingViewKey, today: string, rw: number | null): string {
  const search = new URLSearchParams();
  if (rw !== null) search.set('rw', String(rw));
  if (view === 'under_review') search.set('category', UNDER_REVIEW_VIEW);
  else if (view === 'today') search.set('date', today);
  else if (view !== 'all') search.set('status', view);
  const query = search.toString();
  return query === '' ? BOOKINGS_DASHBOARD_PATH : `${BOOKINGS_DASHBOARD_PATH}?${query}`;
}
