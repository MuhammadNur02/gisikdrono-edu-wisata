import { addMonths, format, getDay, getDaysInMonth } from 'date-fns';
import { id as indonesian } from 'date-fns/locale';

import { OCCUPANCY_WARNING_RATIO } from '@/config/sessions';
import { calendarDateToVisitDate, visitDateToCalendarDate } from '@/lib/utils/dates';

// Pure helpers of /dashboard/sessions (Task P4.3.04): the month grid and the derived occupancy chip.

export type Occupancy = 'open' | 'nearly_full' | 'full';
const DAYS_PER_WEEK = 7;
const MONTH_KEY_FORMAT = 'yyyy-MM';

// docs/StyleGuide.md §6.5: below 80 % nothing, from 80 % `Hampir Penuh`, at the whole capacity `Penuh`. A session
// without seats is full by definition.
export function occupancyOf(reservedPax: number, capacity: number): Occupancy {
  if (capacity <= 0 || reservedPax >= capacity) return 'full';
  return reservedPax / capacity >= OCCUPANCY_WARNING_RATIO ? 'nearly_full' : 'open';
}

// The share of the capacity taken, between 0 and 1, for the quota bars.
export function fillRatio(reservedPax: number, capacity: number): number {
  if (capacity <= 0) return 1;
  return Math.min(1, reservedPax / capacity);
}

export function monthKeyOf(visitDate: string): string {
  return format(visitDateToCalendarDate(visitDate), MONTH_KEY_FORMAT);
}

export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(visitDateToCalendarDate(`${month}-01`), delta), MONTH_KEY_FORMAT);
}

// 'November 2026'
export function monthLabel(month: string): string {
  return format(visitDateToCalendarDate(`${month}-01`), 'MMMM yyyy', { locale: indonesian });
}

// The weeks of a month as rows of seven visit dates, Sunday first, null outside the month.
export function calendarWeeks(month: string): (string | null)[][] {
  const first = visitDateToCalendarDate(`${month}-01`);
  const dayCount = getDaysInMonth(first);
  const cells: (string | null)[] = Array.from({ length: getDay(first) }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    cells.push(calendarDateToVisitDate(date));
  }
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += DAYS_PER_WEEK) {
    weeks.push(cells.slice(start, start + DAYS_PER_WEEK));
  }
  return weeks;
}

// Rows grouped by their visit date, in the order they came.
export function groupByDate<T extends { sessionDate: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows)
    groups.set(row.sessionDate, [...(groups.get(row.sessionDate) ?? []), row]);
  return groups;
}
