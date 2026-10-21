import { describe, expect, it } from 'vitest';

import { createScheduleSchema, updateScheduleSchema } from './schedule';

const VALID = {
  title: 'Pentas Tari Gambang Semarang',
  scheduleType: 'dance_performance',
  descriptionMd: '',
  startsAt: '2026-11-07T19:00',
  endsAt: '2026-11-07T21:00',
  venue: 'Pendopo RW 08',
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=SA',
  imagePath: null,
  packageId: null,
  status: 'published',
};

describe('createScheduleSchema', () => {
  it('stores the times as Semarang wall time with its offset, and parses its own output again', () => {
    const once = createScheduleSchema.parse(VALID);
    expect(once).toMatchObject({
      startsAt: '2026-11-07T19:00:00+07:00',
      endsAt: '2026-11-07T21:00:00+07:00',
      descriptionMd: null,
    });
    expect(createScheduleSchema.parse(once)).toEqual(once);
  });

  it('puts an end before the start under the end field', () => {
    const result = createScheduleSchema.safeParse({ ...VALID, endsAt: '2026-11-07T18:00' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endsAt']);
  });

  it.each([
    ['a rule without FREQ', 'BYDAY=SA'],
    ['a rule with a script in it', 'FREQ=WEEKLY;X=<script>'],
    ['prose', 'setiap Sabtu'],
  ])('refuses %s', (_case, recurrenceRule) => {
    expect(createScheduleSchema.safeParse({ ...VALID, recurrenceRule }).success).toBe(false);
  });

  it('takes no RW, creator or id for a new schedule', () => {
    for (const extra of [
      { rwId: 5 },
      { createdBy: 'user-1' },
      { id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd' },
    ]) {
      expect(createScheduleSchema.safeParse({ ...VALID, ...extra }).success).toBe(false);
    }
  });
});

describe('updateScheduleSchema', () => {
  it('needs the id of the schedule it changes', () => {
    expect(updateScheduleSchema.safeParse(VALID).success).toBe(false);
    expect(
      updateScheduleSchema.safeParse({ ...VALID, id: '0192f3a4-5b6c-7d8e-9f01-23456789abcd' })
        .success,
    ).toBe(true);
  });
});

// Finding 3 of the independent review of PR #18 (decision of 2026-10-21): a date the calendar does not have is
// refused, and so is a rule that names only such days, which would never happen.
describe('calendar dates and recurrence rules', () => {
  it.each([
    ['30 February', '2026-02-30T19:00', '2026-02-30T21:00'],
    ['29 February of a common year', '2027-02-29T19:00', '2027-02-29T21:00'],
    ['a thirteenth month', '2026-13-01T19:00', '2026-13-01T21:00'],
    ['hour 24', '2026-11-07T19:00', '2026-11-07T24:00'],
    ['minute 60', '2026-11-07T19:60', '2026-11-07T21:00'],
  ])('refuses %s', (_case, startsAt, endsAt) => {
    expect(createScheduleSchema.safeParse({ ...VALID, startsAt, endsAt }).success).toBe(false);
  });

  it('takes 29 February of a leap year', () => {
    const leapDay = { ...VALID, startsAt: '2028-02-29T19:00', endsAt: '2028-02-29T21:00' };
    expect(createScheduleSchema.safeParse(leapDay).success).toBe(true);
  });

  it.each([
    ['30 February', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'],
    ['31 April and June', 'FREQ=YEARLY;BYMONTH=4,6;BYMONTHDAY=31'],
    ['the 32nd', 'FREQ=MONTHLY;BYMONTHDAY=32'],
    ['day 0', 'FREQ=MONTHLY;BYMONTHDAY=0'],
    ['the 30th day from the end of February', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-30'],
    ['a thirteenth month', 'FREQ=YEARLY;BYMONTH=13'],
    ['month 0', 'FREQ=YEARLY;BYMONTH=0'],
  ])('refuses a rule for %s', (_case, recurrenceRule) => {
    expect(createScheduleSchema.safeParse({ ...VALID, recurrenceRule }).success).toBe(false);
  });

  it.each([
    'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29',
    'FREQ=YEARLY;BYMONTH=2,3;BYMONTHDAY=30',
    'FREQ=MONTHLY;BYMONTHDAY=31',
    'FREQ=MONTHLY;BYMONTHDAY=-1',
    'RRULE:FREQ=WEEKLY;BYDAY=SA',
  ])('takes %s', (recurrenceRule) => {
    expect(createScheduleSchema.safeParse({ ...VALID, recurrenceRule }).success).toBe(true);
  });
});
