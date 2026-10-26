import { isCalendarDate } from '@/lib/utils/attendance';

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
