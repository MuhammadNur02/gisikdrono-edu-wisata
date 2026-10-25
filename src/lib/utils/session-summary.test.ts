import { describe, expect, it } from 'vitest';

import {
  describeSlotHours,
  describeWeekdays,
  summarizeSessions,
  type SummarisableSession,
} from '@/lib/utils/session-summary';

function session(overrides: Partial<SummarisableSession>): SummarisableSession {
  return {
    sessionDate: '2026-11-03',
    startTime: '08:30:00',
    endTime: '10:30:00',
    label: 'Sesi Pagi',
    capacity: 40,
    ...overrides,
  };
}

describe('describeWeekdays', () => {
  it('reads three or more days in a row as a range from Monday', () => {
    expect(describeWeekdays(new Set([2, 3, 4, 5, 6]))).toBe('Selasa–Sabtu');
  });

  it('lists days that do not run on, Sunday last', () => {
    expect(describeWeekdays(new Set([0, 6]))).toBe('Sabtu dan Minggu');
    expect(describeWeekdays(new Set([1, 3, 5]))).toBe('Senin, Rabu, dan Jumat');
  });

  it('says nothing without a day', () => {
    expect(describeWeekdays(new Set())).toBeNull();
  });
});

describe('summarizeSessions', () => {
  it('collects the days, the distinct times earliest first and the shared capacity', () => {
    const summary = summarizeSessions([
      session({
        sessionDate: '2026-11-07',
        startTime: '13:30:00',
        endTime: '15:30:00',
        label: 'Sesi Siang',
      }),
      session({ sessionDate: '2026-11-03' }),
      session({ sessionDate: '2026-11-04' }),
      session({ sessionDate: '2026-11-05' }),
      session({ sessionDate: '2026-11-06' }),
    ]);
    expect(summary.weekdays).toBe('Selasa–Sabtu');
    expect(summary.slots.map((slot) => slot.label)).toEqual(['Sesi Pagi', 'Sesi Siang']);
    expect(summary.capacity).toBe(40);
  });

  it('gives no capacity when sessions differ, and nothing for no session', () => {
    expect(summarizeSessions([session({}), session({ capacity: 30 })]).capacity).toBeNull();
    expect(summarizeSessions([])).toEqual({ weekdays: null, slots: [], capacity: null });
  });
});

describe('describeSlotHours', () => {
  it('writes every slot and the zone once', () => {
    const slots = summarizeSessions([
      session({}),
      session({ startTime: '13:30:00', endTime: '15:30:00' }),
    ]).slots;
    expect(describeSlotHours(slots)).toBe('08.30–10.30 dan 13.30–15.30 WIB');
    expect(describeSlotHours([])).toBeNull();
  });
});
