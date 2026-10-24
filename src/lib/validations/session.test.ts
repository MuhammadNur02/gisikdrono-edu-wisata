import { describe, expect, it } from 'vitest';

import {
  clockTimeSchema,
  createSessionTemplateSchema,
  createVisitSessionSchema,
  generateSessionsSchema,
  updateVisitSessionSchema,
  weekdayKeyOf,
  weekdayOfKey,
} from './session';

const ROW_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

const TEMPLATE = {
  weekday: '6',
  label: 'Sesi pagi',
  startTime: '08:00',
  endTime: '10:00',
  capacity: 40,
  isActive: true,
};

const SESSION = {
  sessionDate: '2026-11-07',
  label: 'Sesi pagi',
  startTime: '08:00:00',
  endTime: '10:00:00',
  capacity: 40,
  status: 'open',
  notes: '',
};

describe('clockTimeSchema', () => {
  it('reads a time as the field writes it and as Postgres reads it back', () => {
    expect(clockTimeSchema.parse('08:00')).toBe('08:00');
    expect(clockTimeSchema.parse(' 13:30:00 ')).toBe('13:30');
  });

  it.each(['24:00', '8:00', '08.00', ''])('refuses %j', (value) => {
    expect(clockTimeSchema.safeParse(value).success).toBe(false);
  });
});

describe('weekday keys', () => {
  it('keeps the select key in the form and turns it into the stored weekday', () => {
    expect(createSessionTemplateSchema.parse(TEMPLATE).weekday).toBe('6');
    expect(weekdayOfKey('0')).toBe(0);
    expect(weekdayKeyOf(3)).toBe('3');
  });

  it('reads an unknown stored weekday as Saturday', () => {
    expect(weekdayKeyOf(9)).toBe('6');
  });
});

describe('createSessionTemplateSchema', () => {
  it('puts an end before the start under the end field', () => {
    const result = createSessionTemplateSchema.safeParse({ ...TEMPLATE, endTime: '07:00' });
    expect(result.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('wants a capacity of one or more and takes no RW', () => {
    expect(createSessionTemplateSchema.safeParse({ ...TEMPLATE, capacity: 0 }).success).toBe(false);
    expect(createSessionTemplateSchema.safeParse({ ...TEMPLATE, rwId: 5 }).success).toBe(false);
  });
});

describe('visit session schemas', () => {
  it('drops the seconds, reads empty notes as none and lets a session have no seats', () => {
    expect(createVisitSessionSchema.parse({ ...SESSION, capacity: 0 })).toMatchObject({
      startTime: '08:00',
      endTime: '10:00',
      notes: null,
      capacity: 0,
    });
  });

  it('refuses a date that is not on the calendar and an unknown status', () => {
    expect(
      createVisitSessionSchema.safeParse({ ...SESSION, sessionDate: '2026-02-30' }).success,
    ).toBe(false);
    expect(createVisitSessionSchema.safeParse({ ...SESSION, status: 'full' }).success).toBe(false);
  });

  it('needs the row id to update, and nothing more', () => {
    expect(updateVisitSessionSchema.safeParse(SESSION).success).toBe(false);
    expect(updateVisitSessionSchema.safeParse({ ...SESSION, id: ROW_ID }).success).toBe(true);
    expect(
      updateVisitSessionSchema.safeParse({ ...SESSION, id: ROW_ID, reservedPax: 0 }).success,
    ).toBe(false);
  });
});

describe('generateSessionsSchema', () => {
  it('takes a YYYY-MM month only', () => {
    expect(generateSessionsSchema.safeParse({ month: '2026-11' }).success).toBe(true);
    for (const month of ['2026-13', '2026-1', 'November']) {
      expect(generateSessionsSchema.safeParse({ month }).success).toBe(false);
    }
  });
});
