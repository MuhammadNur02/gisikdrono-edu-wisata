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
