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

// '18 Oktober 2026', as a letter or a certificate is dated
export function formatDateWritten(value: Date | string): string {
  return format(inJakarta(value), 'd MMMM yyyy', { locale: indonesian });
}

// '18 Okt 2026', the short form used in tables
export function formatDateShort(value: Date | string): string {
  return format(inJakarta(value), 'd MMM yyyy', { locale: indonesian });
}

// '18 Okt', a chart axis tick
export function formatDayMonthShort(value: Date | string): string {
  return format(inJakarta(value), 'd MMM', { locale: indonesian });
}

// '18 Okt 2026, 19.00 WIB': when something happened, for an audit trail or a price history.
export function formatDateTimeShort(instant: string): string {
  return `${format(inJakarta(instant), 'd MMM yyyy, HH.mm', { locale: indonesian })} WIB`;
}

// '19.00 WIB': the Semarang clock time of an instant, where the day is already on screen (a day's scan history).
export function formatClockTime(instant: string): string {
  return `${format(inJakarta(instant), 'HH.mm')} WIB`;
}

function formatSessionTime(time: string): string {
  const match = SESSION_TIME_PATTERN.exec(time);
  if (!match) throw new RangeError(`Not a session time: ${time}`);
  return `${match[1] ?? ''}.${match[2] ?? ''}`;
}

// A session's start alone: '08.00 WIB'.
export function formatSessionStart(time: string): string {
  return `${formatSessionTime(time)} WIB`;
}

// Session times are Postgres `time` values ('08:00:00'); Indonesian writes them '08.00–10.00 WIB'.
export function formatTimeRange(start: string, end: string): string {
  return `${formatSessionTime(start)}–${formatSessionTime(end)} WIB`;
}

// A performance or event runs between two timestamps; its hours read in Semarang time: '19.00–21.00 WIB'.
export function formatInstantTimeRange(startsAt: string, endsAt: string): string {
  const clock = (value: string) => format(inJakarta(value), 'HH.mm');
  return `${clock(startsAt)}–${clock(endsAt)} WIB`;
}

// An instant written with Semarang's +07:00 offset, as schema.org Event dates want it (src/lib/seo/json-ld.ts).
export function toJakartaIsoString(instant: string): string {
  return format(inJakarta(instant), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// What a datetime-local field shows for a stored instant: its Semarang wall time, '2026-10-25T19:00'.
export function toJakartaDateTimeField(instant: string): string {
  return format(inJakarta(instant), "yyyy-MM-dd'T'HH:mm");
}

// An instant as Midtrans writes times, in Semarang time with its offset: '2026-10-24 09:30:00 +0700'.
export function toMidtransTime(instant: Date): string {
  return format(inJakarta(instant), 'yyyy-MM-dd HH:mm:ss xx');
}

// The Semarang month an instant falls in: '2026-11' as a key, 'November 2026' to read.
export function jakartaMonthKey(instant: string): string {
  return format(inJakarta(instant), 'yyyy-MM');
}

export function formatMonthLong(instant: string): string {
  return format(inJakarta(instant), 'MMMM yyyy', { locale: indonesian });
}

// The Semarang calendar day an instant falls on, as a visit date.
export function toVisitDate(instant: Date): string {
  return format(inJakarta(instant), VISIT_DATE_FORMAT);
}

export function todayInJakarta(now: Date = new Date()): string {
  return toVisitDate(now);
}

// The first and last visit date of the coming `days` days, today in Semarang included: the window the
// package page previews (docs/PRD.md FR-PUB-12, 14 days).
export function upcomingVisitDates(
  days: number,
  now: Date = new Date(),
): { from: string; to: string } {
  return { from: toVisitDate(now), to: toVisitDate(addDays(inJakarta(now), days - 1)) };
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

// The instant a session starts: its date and its Semarang wall time ('08:30:00').
export function sessionStartsAt(sessionDate: string, startTime: string): Date {
  const [year, monthIndex, day] = parseVisitDateParts(sessionDate);
  const match = SESSION_TIME_PATTERN.exec(startTime);
  if (!match) throw new RangeError(`Not a session time: ${startTime}`);
  return new Date(
    new TZDate(year, monthIndex, day, Number(match[1]), Number(match[2]), APP_TZ).getTime(),
  );
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
