import type { PerformanceSchedule } from '@/types/schedule';

// docs/PRD.md FR-PUB-09: the RW 08 page previews the next five published schedules. A recurring schedule may
// have started long ago and still be running, so it stays in; spelling out its next dates is the full
// schedule page's work (Task P2.4.04).
export const SCHEDULE_PREVIEW_LIMIT = 5;

export function upcomingSchedules(
  schedules: readonly PerformanceSchedule[],
  now: Date,
  limit: number = SCHEDULE_PREVIEW_LIMIT,
): PerformanceSchedule[] {
  const nowMs = now.getTime();
  return schedules
    .filter((schedule) => schedule.recurrenceRule !== null || Date.parse(schedule.endsAt) >= nowMs)
    .toSorted((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))
    .slice(0, limit);
}
