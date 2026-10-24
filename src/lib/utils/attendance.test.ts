import { describe, expect, it } from 'vitest';

import { attendanceDateOf, scanWindowOf } from './attendance';

const TODAY = '2026-10-24';

describe('attendanceDateOf', () => {
  it('is today without a date or with one that is not a calendar day', () => {
    expect(attendanceDateOf(null, TODAY)).toBe(TODAY);
    expect(attendanceDateOf('besok', TODAY)).toBe(TODAY);
    expect(attendanceDateOf('2026-02-30', TODAY)).toBe(TODAY);
    expect(attendanceDateOf('2026-10-24T00:00', TODAY)).toBe(TODAY);
  });

  it('keeps an earlier day of the last year', () => {
    expect(attendanceDateOf('2026-10-23', TODAY)).toBe('2026-10-23');
    expect(attendanceDateOf('2025-10-24', TODAY)).toBe('2025-10-24');
  });

  it('refuses a day ahead and one older than a year', () => {
    expect(attendanceDateOf('2026-10-25', TODAY)).toBe(TODAY);
    expect(attendanceDateOf('2025-10-23', TODAY)).toBe(TODAY);
  });
});

describe('scanWindowOf', () => {
  it('runs from Semarang midnight to the next one', () => {
    expect(scanWindowOf('2026-10-24')).toEqual({
      from: '2026-10-23T17:00:00.000Z',
      before: '2026-10-24T17:00:00.000Z',
    });
  });
});
