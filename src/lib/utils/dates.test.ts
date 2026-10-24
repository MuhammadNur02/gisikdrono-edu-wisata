import { describe, expect, it } from 'vitest';

import {
  bookableRange,
  calendarDateToVisitDate,
  formatDateLong,
  formatDateShort,
  formatDateTimeShort,
  formatInstantTimeRange,
  formatMonthLong,
  jakartaMonthKey,
  sessionStartsAt,
  toJakartaIsoString,
  toMidtransTime,
  formatTimeRange,
  todayInJakarta,
  toVisitDate,
  upcomingVisitDates,
  visitDateToCalendarDate,
} from './dates';

describe('formatDateLong', () => {
  it('writes a visit date in Indonesian without shifting the day', () => {
    expect(formatDateLong('2026-10-18')).toBe('Minggu, 18 Oktober 2026');
    expect(formatDateLong('2026-10-17')).toBe('Sabtu, 17 Oktober 2026');
  });

  it('reads timestamps as Semarang time', () => {
    // 17:30 UTC is 00:30 the next day in Semarang.
    expect(formatDateLong(new Date('2026-10-17T17:30:00Z'))).toBe('Minggu, 18 Oktober 2026');
    expect(formatDateLong('2026-10-17T16:59:00Z')).toBe('Sabtu, 17 Oktober 2026');
  });

  it('refuses something that is neither a visit date nor a timestamp', () => {
    expect(() => formatDateLong('2026-13-45x')).toThrow(RangeError);
  });
});

describe('formatDateShort', () => {
  it('uses the abbreviated Indonesian month', () => {
    expect(formatDateShort('2026-10-18')).toBe('18 Okt 2026');
    expect(formatDateShort('2026-08-17')).toBe('17 Agt 2026');
  });
});

describe('formatDateTimeShort', () => {
  it('writes an instant as Semarang date and time', () => {
    expect(formatDateTimeShort('2026-10-17T17:30:00Z')).toBe('18 Okt 2026, 00.30 WIB');
  });
});

describe('formatTimeRange', () => {
  it('writes session times with dots, an en dash and WIB', () => {
    expect(formatTimeRange('08:00:00', '10:00:00')).toBe('08.00–10.00 WIB');
    expect(formatTimeRange('13:30', '15:00')).toBe('13.30–15.00 WIB');
  });

  it('refuses a malformed time', () => {
    expect(() => formatTimeRange('8 pagi', '10:00')).toThrow(RangeError);
  });
});

describe('visit dates and Semarang days', () => {
  it('takes the Semarang calendar day of an instant', () => {
    expect(toVisitDate(new Date('2026-10-17T17:00:00Z'))).toBe('2026-10-18');
    expect(todayInJakarta(new Date('2026-10-17T16:59:59Z'))).toBe('2026-10-17');
  });

  it('round-trips a clicked calendar day unchanged', () => {
    const calendarDate = visitDateToCalendarDate('2026-12-31');
    expect(calendarDate.getFullYear()).toBe(2026);
    expect(calendarDate.getMonth()).toBe(11);
    expect(calendarDate.getDate()).toBe(31);
    expect(calendarDateToVisitDate(calendarDate)).toBe('2026-12-31');
  });

  it('refuses a malformed visit date', () => {
    expect(() => visitDateToCalendarDate('18-10-2026')).toThrow(RangeError);
  });
});

describe('bookableRange', () => {
  it('opens after the lead time and closes after the advance window, in Semarang days', () => {
    // 20:00 WIB on 17 Oct; 12 hours later is 08:00 WIB on 18 Oct.
    const now = new Date('2026-10-17T13:00:00Z');
    expect(bookableRange({ now, minLeadHours: 12, maxAdvanceDays: 180 })).toEqual({
      first: '2026-10-18',
      last: '2027-04-15',
    });
  });

  it('keeps today open when the lead time still fits in it', () => {
    const now = new Date('2026-10-17T00:00:00Z'); // 07:00 WIB
    expect(bookableRange({ now, minLeadHours: 12, maxAdvanceDays: 1 }).first).toBe('2026-10-17');
  });
});

describe('sessionStartsAt', () => {
  it('reads a session date and time as Semarang wall time', () => {
    expect(sessionStartsAt('2026-11-12', '08:30:00').toISOString()).toBe(
      '2026-11-12T01:30:00.000Z',
    );
    expect(sessionStartsAt('2026-11-12', '00:15').toISOString()).toBe('2026-11-11T17:15:00.000Z');
  });

  it('refuses a time that is not a session time', () => {
    expect(() => sessionStartsAt('2026-11-12', '8.30')).toThrow(RangeError);
  });
});

describe('formatInstantTimeRange', () => {
  it('reads a performance start and end in Semarang time', () => {
    expect(formatInstantTimeRange('2026-10-18T12:00:00Z', '2026-10-18T14:30:00Z')).toBe(
      '19.00–21.30 WIB',
    );
  });
});

describe('Semarang months and Event dates', () => {
  it('writes an instant with the +07:00 offset', () => {
    expect(toJakartaIsoString('2026-10-18T12:00:00Z')).toBe('2026-10-18T19:00:00+07:00');
  });

  it('writes an instant as Midtrans writes its times', () => {
    expect(toMidtransTime(new Date('2026-10-24T02:30:00Z'))).toBe('2026-10-24 09:30:00 +0700');
  });

  it('puts a late-evening UTC instant in the next Semarang month', () => {
    expect(jakartaMonthKey('2026-10-31T18:00:00Z')).toBe('2026-11');
    expect(formatMonthLong('2026-10-31T18:00:00Z')).toBe('November 2026');
  });
});

describe('upcomingVisitDates', () => {
  it('spans the coming days from today in Semarang, today included', () => {
    expect(upcomingVisitDates(14, new Date('2026-10-18T20:00:00Z'))).toEqual({
      from: '2026-10-19',
      to: '2026-11-01',
    });
  });
});
