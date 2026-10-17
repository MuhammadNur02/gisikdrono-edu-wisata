import { TZDate } from '@date-fns/tz';
import { addDays, addHours, format } from 'date-fns';
import { id as indonesian } from 'date-fns/locale';

import { APP_TZ } from '@/config/site';

// A visit date is a Postgres `date` ('2026-10-18'): a day on the calendar, not an instant in time.
const VISIT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SESSION_TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2})?$/;
const VISIT_DATE_FORMAT = 'yyyy-MM-dd';

function parseVisitDateParts(visitDate: string): [number, number, number] {
  const match = VISIT_DATE_PATTERN.exec(visitDate);
  if (!match) throw new RangeError(`Not a visit date: ${visitDate}`);
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

// Visit dates stay on their own day; timestamps are read as Semarang time.
function inJakarta(value: Date | string): TZDate {
  if (typeof value === 'string' && VISIT_DATE_PATTERN.test(value)) {
    const [year, monthIndex, day] = parseVisitDateParts(value);
    return new TZDate(year, monthIndex, day, APP_TZ);
  }
  return new TZDate(new Date(value).getTime(), APP_TZ);
}

// 'Sabtu, 18 Oktober 2026'
export function formatDateLong(value: Date | string): string {
  return format(inJakarta(value), 'EEEE, d MMMM yyyy', { locale: indonesian });
}

// '18 Okt 2026', the short form used in tables
export function formatDateShort(value: Date | string): string {
  return format(inJakarta(value), 'd MMM yyyy', { locale: indonesian });
}

function formatSessionTime(time: string): string {
  const match = SESSION_TIME_PATTERN.exec(time);
  if (!match) throw new RangeError(`Not a session time: ${time}`);
  return `${match[1] ?? ''}.${match[2] ?? ''}`;
}

// Session times are Postgres `time` values ('08:00:00'); Indonesian writes them '08.00–10.00 WIB'.
export function formatTimeRange(start: string, end: string): string {
  return `${formatSessionTime(start)}–${formatSessionTime(end)} WIB`;
}

// The Semarang calendar day an instant falls on, as a visit date.
export function toVisitDate(instant: Date): string {
  return format(inJakarta(instant), VISIT_DATE_FORMAT);
}

export function todayInJakarta(now: Date = new Date()): string {
  return toVisitDate(now);
}

// The date picker works with the browser's local midnight; these two keep the clicked day unchanged
// no matter which time zone the visitor's phone is set to.
export function visitDateToCalendarDate(visitDate: string): Date {
  const [year, monthIndex, day] = parseVisitDateParts(visitDate);
  return new Date(year, monthIndex, day);
}

export function calendarDateToVisitDate(date: Date): string {
  return format(date, VISIT_DATE_FORMAT);
}

export interface BookingWindowRules {
  now: Date;
  minLeadHours: number;
  maxAdvanceDays: number;
}

// The first and last bookable visit dates from site_settings booking.min_lead_hours and
// booking.max_advance_days (docs/StyleGuide.md §5.6 DatePicker).
export function bookableRange({ now, minLeadHours, maxAdvanceDays }: BookingWindowRules) {
  return {
    first: toVisitDate(addHours(now, minLeadHours)),
    last: toVisitDate(addDays(now, maxAdvanceDays)),
  };
}
