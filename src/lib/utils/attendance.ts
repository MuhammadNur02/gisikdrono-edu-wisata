import { ATTENDANCE_HISTORY_DAYS } from '@/config/attendance';
import { dayAfter, startOfJakartaDay, visitDateAfter } from '@/lib/utils/kpi';

// /dashboard/attendance (Task P4.3.09) reads one Semarang day at a time: today unless `?date=` names an earlier day of
// the last year. Pure, so the page and the service read the URL the same way.

const VISIT_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar day, not a rolled-over one ('2026-02-30' would be read as 2 March).
export function isCalendarDate(value: string): boolean {
  if (!VISIT_DATE.test(value)) return false;
  try {
    return visitDateAfter(value, 0) === value;
  } catch {
    return false;
  }
}

// The day the page shows: the requested one when it is a calendar day from a year ago up to today, else today.
export function attendanceDateOf(requested: string | null, today: string): string {
  if (requested === null || !isCalendarDate(requested)) return today;
  if (requested > today || requested < visitDateAfter(today, -ATTENDANCE_HISTORY_DAYS))
    return today;
  return requested;
}

// The instants a Semarang day's scans fall between: from its midnight, before the next one.
export function scanWindowOf(date: string): { from: string; before: string } {
  return { from: startOfJakartaDay(date), before: startOfJakartaDay(dayAfter(date)) };
}
