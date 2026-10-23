import { describe, expect, it } from 'vitest';

import {
  calendarWeeks,
  fillRatio,
  groupByDate,
  monthKeyOf,
  monthLabel,
  occupancyOf,
  shiftMonth,
} from './sessions';

describe('occupancyOf and fillRatio', () => {
  it('reads below 80 % as open, from 80 % as nearly full, at capacity as full', () => {
    expect(occupancyOf(0, 40)).toBe('open');
    expect(occupancyOf(31, 40)).toBe('open');
    expect(occupancyOf(32, 40)).toBe('nearly_full');
    expect(occupancyOf(40, 40)).toBe('full');
    expect(occupancyOf(0, 0)).toBe('full');
  });

  it('caps the fill at the whole bar', () => {
    expect(fillRatio(10, 40)).toBe(0.25);
    expect(fillRatio(50, 40)).toBe(1);
    expect(fillRatio(0, 0)).toBe(1);
  });
});

describe('month helpers', () => {
  it('names and shifts a month', () => {
    expect(monthKeyOf('2026-11-07')).toBe('2026-11');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-11')).toBe('November 2026');
  });

  it('lays November 2026 out in weeks starting on Sunday', () => {
    const weeks = calendarWeeks('2026-11');
    // 1 November 2026 is a Sunday, so the first row starts with it.
    expect(weeks[0]?.[0]).toBe('2026-11-01');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.at(-1)?.at(-1)).toBeNull();
  });

  it('pads the days before the first of a month that starts midweek', () => {
    // 1 October 2026 is a Thursday.
    const [firstWeek] = calendarWeeks('2026-10');
    expect(firstWeek?.slice(0, 4)).toEqual([null, null, null, null]);
    expect(firstWeek?.[4]).toBe('2026-10-01');
  });
});

describe('groupByDate', () => {
  it('keeps rows of one day together in their order', () => {
    const rows = [
      { sessionDate: '2026-11-07', label: 'Pagi' },
      { sessionDate: '2026-11-08', label: 'Pagi' },
      { sessionDate: '2026-11-07', label: 'Siang' },
    ];
    const groups = groupByDate(rows);
    expect(groups.get('2026-11-07')?.map((row) => row.label)).toEqual(['Pagi', 'Siang']);
    expect(groups.get('2026-11-09')).toBeUndefined();
  });
});
