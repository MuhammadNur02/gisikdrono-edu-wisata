import { describe, expect, it } from 'vitest';

import {
  averageOf,
  dayAfter,
  dayBefore,
  fillDailySeries,
  hasAnyValue,
  lastDays,
  monthRanges,
  quotaUsagePercent,
  startOfJakartaDay,
  sumOf,
  sumWithin,
  trendBetween,
  visitDateAfter,
} from './kpi';

// 2026-11-01 00:30 in Semarang is still 31 October in UTC.
const EARLY_NOVEMBER = new Date('2026-10-31T17:30:00Z');

describe('sumOf', () => {
  it('adds the picked values and is zero for no rows', () => {
    expect(sumOf([{ pax: 3 }, { pax: 4 }], (row) => row.pax)).toBe(7);
    expect(sumOf([], () => 1)).toBe(0);
  });
});

describe('trendBetween', () => {
  it('is flat without a percentage when both periods are empty', () => {
    expect(trendBetween(0, 0)).toEqual({ direction: 'flat', percent: null });
  });

  it('is flat at zero percent for equal non-zero periods', () => {
    expect(trendBetween(5, 5)).toEqual({ direction: 'flat', percent: 0 });
  });

  it('never invents a percentage over an empty previous period', () => {
    expect(trendBetween(10, 0)).toEqual({ direction: 'up', percent: null });
    expect(trendBetween(-10, 0)).toEqual({ direction: 'down', percent: null });
  });

  it('rounds the change to one decimal', () => {
    expect(trendBetween(1125, 1000)).toEqual({ direction: 'up', percent: 12.5 });
    expect(trendBetween(2, 3)).toEqual({ direction: 'down', percent: -33.3 });
  });

  it('measures against the size of a negative previous period', () => {
    expect(trendBetween(-50, -100)).toEqual({ direction: 'up', percent: 50 });
  });
});

describe('quotaUsagePercent', () => {
  it('is null when no session runs', () => {
    expect(quotaUsagePercent(0, 0)).toBeNull();
  });

  it('rounds to a whole percentage', () => {
    expect(quotaUsagePercent(1, 3)).toBe(33);
    expect(quotaUsagePercent(40, 40)).toBe(100);
  });
});

describe('averageOf', () => {
  it('is null without values and one decimal otherwise', () => {
    expect(averageOf([])).toBeNull();
    expect(averageOf([5, 4, 4])).toBe(4.3);
  });
});

describe('monthRanges', () => {
  it('reads the month in Semarang time and compares the same days', () => {
    expect(monthRanges(EARLY_NOVEMBER)).toEqual({
      current: { from: '2026-11-01', to: '2026-11-01' },
      previous: { from: '2026-10-01', to: '2026-10-01' },
    });
  });

  it('crosses a year', () => {
    expect(monthRanges(new Date('2027-01-15T03:00:00Z')).previous).toEqual({
      from: '2026-12-01',
      to: '2026-12-15',
    });
  });

  it('ends the previous period at the last day of a shorter month', () => {
    expect(monthRanges(new Date('2027-03-31T03:00:00Z')).previous).toEqual({
      from: '2027-02-01',
      to: '2027-02-28',
    });
  });
});

describe('sumWithin', () => {
  it('adds the days of the range, both ends included', () => {
    const rows = [
      { day: '2026-10-31', value: 1 },
      { day: '2026-11-01', value: 2 },
      { day: '2026-11-15', value: 4 },
      { day: '2026-11-16', value: 8 },
    ];
    expect(sumWithin(rows, { from: '2026-11-01', to: '2026-11-15' })).toBe(6);
  });
});

describe('lastDays and fillDailySeries', () => {
  it('lists the days oldest first, today last', () => {
    expect(lastDays(3, EARLY_NOVEMBER)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('fills quiet days with zero and adds rows of the same day', () => {
    const days = ['2026-10-30', '2026-10-31'];
    const series = fillDailySeries(days, [
      { day: '2026-10-31', value: 2 },
      { day: '2026-10-31', value: 3 },
      { day: '2026-09-01', value: 9 },
    ]);
    expect(series).toEqual([
      { day: '2026-10-30', value: 0 },
      { day: '2026-10-31', value: 5 },
    ]);
    expect(hasAnyValue(series)).toBe(true);
    expect(hasAnyValue(fillDailySeries(days, []))).toBe(false);
  });
});

describe('Semarang days of instants', () => {
  it('starts a Semarang day at 17:00 UTC the evening before', () => {
    expect(startOfJakartaDay('2026-11-01')).toBe('2026-10-31T17:00:00.000Z');
  });

  it('refuses what is not a visit date', () => {
    expect(() => startOfJakartaDay('besok')).toThrow(RangeError);
  });

  it('steps to the next day across a month and a year', () => {
    expect(dayAfter('2026-10-31')).toBe('2026-11-01');
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
  });

  it('steps to the day before across a year', () => {
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });
});

describe('visitDateAfter', () => {
  it('counts Semarang calendar days across a month', () => {
    expect(visitDateAfter('2026-10-24', 30)).toBe('2026-11-23');
    expect(visitDateAfter('2026-10-24', 0)).toBe('2026-10-24');
  });
});
