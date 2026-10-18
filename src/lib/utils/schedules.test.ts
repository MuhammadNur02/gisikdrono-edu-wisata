import { describe, expect, it } from 'vitest';

import {
  expandSchedules,
  groupByMonth,
  scheduleWindowEnd,
  upcomingOccurrences,
} from '@/lib/utils/schedules';
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
const IN_A_MONTH = new Date('2026-11-18T05:00:00Z');

describe('expandSchedules', () => {
  it('keeps one-off events that have not ended, soonest first, and drops what is over', () => {
    const result = expandSchedules(
      [
        schedule('later', '2026-11-01T12:00:00Z', '2026-11-01T14:00:00Z'),
        schedule('over', '2026-10-01T12:00:00Z', '2026-10-01T14:00:00Z'),
        schedule('running', '2026-10-18T04:00:00Z', '2026-10-18T06:00:00Z'),
        schedule('beyond', '2026-12-25T12:00:00Z', '2026-12-25T14:00:00Z'),
      ],
      NOW,
      IN_A_MONTH,
    );

    expect(result.map((item) => item.schedule.id)).toEqual(['running', 'later']);
  });

  it('spells out a weekly schedule that started in the past, each repeat as long as the first', () => {
    const result = expandSchedules(
      [schedule('weekly', '2026-01-04T12:00:00Z', '2026-01-04T14:00:00Z', 'FREQ=WEEKLY;BYDAY=SU')],
      NOW,
      IN_A_MONTH,
    );

    expect(result.map((item) => [item.startsAt, item.endsAt])).toEqual([
      ['2026-10-18T12:00:00.000Z', '2026-10-18T14:00:00.000Z'],
      ['2026-10-25T12:00:00.000Z', '2026-10-25T14:00:00.000Z'],
      ['2026-11-01T12:00:00.000Z', '2026-11-01T14:00:00.000Z'],
      ['2026-11-08T12:00:00.000Z', '2026-11-08T14:00:00.000Z'],
      ['2026-11-15T12:00:00.000Z', '2026-11-15T14:00:00.000Z'],
    ]);
  });

  it('keeps a repeat that began before the window and is still running', () => {
    const result = expandSchedules(
      [schedule('daily', '2026-10-01T04:00:00Z', '2026-10-01T06:00:00Z', 'FREQ=DAILY;COUNT=30')],
      NOW,
      new Date('2026-10-18T23:00:00Z'),
    );

    expect(result.map((item) => item.startsAt)).toEqual(['2026-10-18T04:00:00.000Z']);
  });

  it('reads a rule the CMS stored with its RRULE: prefix', () => {
    const result = expandSchedules(
      [schedule('monthly', '2026-10-20T12:00:00Z', '2026-10-20T13:00:00Z', 'RRULE:FREQ=MONTHLY')],
      NOW,
      IN_A_MONTH,
    );

    expect(result.map((item) => item.startsAt)).toEqual(['2026-10-20T12:00:00.000Z']);
  });

  it('falls back to the first date for a rule it cannot read', () => {
    const result = expandSchedules(
      [schedule('broken', '2026-10-25T12:00:00Z', '2026-10-25T14:00:00Z', 'NOT A RULE')],
      NOW,
      IN_A_MONTH,
    );

    expect(result.map((item) => item.startsAt)).toEqual(['2026-10-25T12:00:00.000Z']);
  });
});

describe('upcomingOccurrences', () => {
  it('previews five at most, within the 90-day window', () => {
    const result = upcomingOccurrences(
      [schedule('weekly', '2026-10-19T12:00:00Z', '2026-10-19T14:00:00Z', 'FREQ=WEEKLY')],
      NOW,
    );

    expect(result).toHaveLength(5);
    expect(scheduleWindowEnd(NOW).toISOString()).toBe('2027-01-16T05:00:00.000Z');
  });
});

describe('groupByMonth', () => {
  it('groups sorted occurrences by their Semarang month', () => {
    const occurrences = expandSchedules(
      [
        schedule('a', '2026-10-25T12:00:00Z', '2026-10-25T14:00:00Z'),
        schedule('b', '2026-10-31T18:00:00Z', '2026-10-31T20:00:00Z'),
        schedule('c', '2026-11-10T12:00:00Z', '2026-11-10T14:00:00Z'),
      ],
      NOW,
      IN_A_MONTH,
    );

    expect(
      groupByMonth(occurrences).map((month) => [
        month.key,
        month.label,
        month.occurrences.map((item) => item.schedule.id),
      ]),
    ).toEqual([
      ['2026-10', 'Oktober 2026', ['a']],
      ['2026-11', 'November 2026', ['b', 'c']],
    ]);
  });
});
