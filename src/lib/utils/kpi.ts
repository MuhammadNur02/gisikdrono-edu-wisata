import { TZDate } from '@date-fns/tz';
import { addDays, format, min, startOfMonth, subMonths } from 'date-fns';

import { APP_TZ } from '@/config/site';

// The arithmetic behind the overview KPIs (docs/StyleGuide.md §6.3, Task P4.2.03). Pure, so every figure on
// /dashboard is the sum of rows the database returned and nothing else: no row, no number (an empty state).

const VISIT_DATE_FORMAT = 'yyyy-MM-dd';
const PERCENT = 100;
const ONE_DECIMAL = 10;

export type TrendDirection = 'up' | 'down' | 'flat';

export interface Trend {
  direction: TrendDirection;
  // Rounded to one decimal; null when the previous period had nothing to compare with.
  percent: number | null;
}

// A Semarang calendar range in visit dates, both ends included.
export interface DateRange {
  from: string;
  to: string;
}

export interface DailyValue {
  day: string;
  value: number;
}

export function sumOf<Row>(rows: readonly Row[], pick: (row: Row) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

// The change against the previous period. From zero to anything is "up" without a percentage, because a
// percentage of nothing would be invented.
export function trendBetween(current: number, previous: number): Trend {
  if (current === previous) return { direction: 'flat', percent: current === 0 ? null : 0 };
  const direction = current > previous ? 'up' : 'down';
  if (previous === 0) return { direction, percent: null };
  const change = ((current - previous) / Math.abs(previous)) * PERCENT;
  return { direction, percent: Math.round(change * ONE_DECIMAL) / ONE_DECIMAL };
}

// Seats taken of today's sessions as a whole percentage; null when no session runs today.
export function quotaUsagePercent(reservedPax: number, capacity: number): number | null {
  if (capacity <= 0) return null;
  return Math.round((reservedPax / capacity) * PERCENT);
}

export function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((sumOf(values, (value) => value) / values.length) * ONE_DECIMAL) / ONE_DECIMAL;
}

function jakartaNow(now: Date): TZDate {
  return new TZDate(now.getTime(), APP_TZ);
}

// This Semarang month up to today, and the same days of the month before (1–15 October against 1–15
// November), so a trend early in the month is not measured against a whole month. A day the shorter month
// lacks ends the previous period at its last day (31 March against 1–28 February).
export function monthRanges(now: Date = new Date()): { current: DateRange; previous: DateRange } {
  const today = jakartaNow(now);
  const monthStart = startOfMonth(today);
  const previousStart = subMonths(monthStart, 1);
  const previousEnd = min([addDays(previousStart, today.getDate() - 1), addDays(monthStart, -1)]);
  return {
    current: { from: format(monthStart, VISIT_DATE_FORMAT), to: format(today, VISIT_DATE_FORMAT) },
    previous: {
      from: format(previousStart, VISIT_DATE_FORMAT),
      to: format(previousEnd, VISIT_DATE_FORMAT),
    },
  };
}

// The total of the days of a range, both ends included.
export function sumWithin(rows: readonly DailyValue[], range: DateRange): number {
  return sumOf(
    rows.filter((row) => row.day >= range.from && row.day <= range.to),
    (row) => row.value,
  );
}

// The last `days` Semarang days, today included, oldest first.
export function lastDays(days: number, now: Date = new Date()): string[] {
  const today = jakartaNow(now);
  return Array.from({ length: days }, (_, index) =>
    format(addDays(today, index - days + 1), VISIT_DATE_FORMAT),
  );
}

// One point per day, zero where the database had no row, so a chart never skips a quiet day.
export function fillDailySeries(
  days: readonly string[],
  rows: readonly DailyValue[],
): DailyValue[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.day, (totals.get(row.day) ?? 0) + row.value);
  return days.map((day) => ({ day, value: totals.get(day) ?? 0 }));
}

export function hasAnyValue(series: readonly DailyValue[]): boolean {
  return series.some((point) => point.value !== 0);
}

function midnightInJakarta(visitDate: string): TZDate {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = visitDate
    .split('-')
    .map(Number);
  const midnight = new TZDate(year, month - 1, day, APP_TZ);
  if (Number.isNaN(midnight.getTime())) throw new RangeError(`Not a visit date: ${visitDate}`);
  return midnight;
}

// The UTC instant a Semarang day starts, for filtering timestamptz columns by a visit date.
export function startOfJakartaDay(visitDate: string): string {
  return new Date(midnightInJakarta(visitDate).getTime()).toISOString();
}

// The visit date `days` Semarang days after another.
export function visitDateAfter(visitDate: string, days: number): string {
  return format(addDays(midnightInJakarta(visitDate), days), VISIT_DATE_FORMAT);
}

export function dayAfter(visitDate: string): string {
  return visitDateAfter(visitDate, 1);
}

export function dayBefore(visitDate: string): string {
  return visitDateAfter(visitDate, -1);
}
