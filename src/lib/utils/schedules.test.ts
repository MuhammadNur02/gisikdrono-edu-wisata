import { describe, expect, it } from 'vitest';

import { upcomingSchedules } from '@/lib/utils/schedules';
import type { PerformanceSchedule } from '@/types/schedule';

function schedule(
  id: string,
  startsAt: string,
  endsAt: string,
  recurrenceRule: string | null = null,
) {
  return {
    id,
    rwId: 8,
    title: id,
    scheduleType: 'dance_performance',
    descriptionMd: null,
    startsAt,
    endsAt,
    venue: null,
    recurrenceRule,
    image: null,
    packageSlug: null,
  } satisfies PerformanceSchedule;
}

const NOW = new Date('2026-10-18T05:00:00Z');

describe('upcomingSchedules', () => {
  it('keeps what has not ended, soonest first, and drops what is over', () => {
    const result = upcomingSchedules(
      [
        schedule('later', '2026-11-01T12:00:00Z', '2026-11-01T14:00:00Z'),
        schedule('over', '2026-10-01T12:00:00Z', '2026-10-01T14:00:00Z'),
        schedule('running', '2026-10-18T04:00:00Z', '2026-10-18T06:00:00Z'),
      ],
      NOW,
    );

    expect(result.map((item) => item.id)).toEqual(['running', 'later']);
  });

  it('keeps a recurring schedule that started in the past', () => {
    const result = upcomingSchedules(
      [schedule('weekly', '2026-01-04T12:00:00Z', '2026-01-04T14:00:00Z', 'FREQ=WEEKLY;BYDAY=SU')],
      NOW,
    );

    expect(result.map((item) => item.id)).toEqual(['weekly']);
  });

  it('shows five at most', () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      schedule(
        `s${String(index)}`,
        `2026-11-0${String(index + 1)}T12:00:00Z`,
        `2026-11-0${String(index + 1)}T14:00:00Z`,
      ),
    );

    expect(upcomingSchedules(many, NOW)).toHaveLength(5);
  });
});
