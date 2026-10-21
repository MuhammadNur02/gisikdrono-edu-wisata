import { rrulestr } from 'rrule';

import { formatMonthLong, jakartaMonthKey } from '@/lib/utils/dates';
import type { PerformanceSchedule, ScheduleOccurrence } from '@/types/schedule';

// docs/PRD.md FR-PUB-09/10: a schedule happens once (starts_at to ends_at) or repeats by its RFC 5545
// `recurrence_rule`, each time lasting as long as the first. Jakarta has no daylight saving, so repeating at the
// same UTC time is repeating at the same Semarang time.

// How far ahead the schedule page and the preview on an RW page look.
export const SCHEDULE_WINDOW_DAYS = 90;
// docs/PRD.md FR-PUB-09: the page of an RW with a schedule previews the next five.
export const SCHEDULE_PREVIEW_LIMIT = 5;

const DAY_MS = 86_400_000;

function occurrence(
  schedule: PerformanceSchedule,
  start: Date,
  durationMs: number,
): ScheduleOccurrence {
  return {
    schedule,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + durationMs).toISOString(),
  };
}

// A rule the CMS let through but rrule cannot read leaves the first date only, rather than a broken page.
function recurrenceStarts(
  schedule: PerformanceSchedule,
  from: Date,
  to: Date,
  durationMs: number,
): Date[] {
  const firstStart = new Date(schedule.startsAt);
  if (!schedule.recurrenceRule) return [firstStart];
  try {
    const rule = rrulestr(schedule.recurrenceRule, { dtstart: firstStart });
    // Starting a duration early keeps an occurrence that began before `from` and is still running.
    return rule.between(new Date(from.getTime() - durationMs), to, true);
  } catch {
    return [firstStart];
  }
}

// Every occurrence that has not ended by `from` and starts before `to`, soonest first.
export function expandSchedules(
  schedules: readonly PerformanceSchedule[],
  from: Date,
  to: Date,
): ScheduleOccurrence[] {
  return schedules
    .flatMap((schedule) => {
      const durationMs = Date.parse(schedule.endsAt) - Date.parse(schedule.startsAt);
      return recurrenceStarts(schedule, from, to, durationMs).map((start) =>
        occurrence(schedule, start, durationMs),
      );
    })
    .filter(
      (item) =>
        Date.parse(item.endsAt) >= from.getTime() && Date.parse(item.startsAt) < to.getTime(),
    )
    .toSorted((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt));
}

export function scheduleWindowEnd(now: Date): Date {
  return new Date(now.getTime() + SCHEDULE_WINDOW_DAYS * DAY_MS);
}

export function upcomingOccurrences(
  schedules: readonly PerformanceSchedule[],
  now: Date,
  limit: number = SCHEDULE_PREVIEW_LIMIT,
): ScheduleOccurrence[] {
  return expandSchedules(schedules, now, scheduleWindowEnd(now)).slice(0, limit);
}

export interface ScheduleMonth {
  // '2026-11', also the anchor of the month on the schedule page.
  key: string;
  label: string;
  occurrences: ScheduleOccurrence[];
}

// docs/PRD.md FR-PUB-10: the schedule page reads month by month, in Semarang months.
export function groupByMonth(occurrences: readonly ScheduleOccurrence[]): ScheduleMonth[] {
  const months: ScheduleMonth[] = [];
  for (const item of occurrences) {
    const key = jakartaMonthKey(item.startsAt);
    const current = months.at(-1);
    if (current?.key === key) current.occurrences.push(item);
    else months.push({ key, label: formatMonthLong(item.startsAt), occurrences: [item] });
  }
  return months;
}
