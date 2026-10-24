import { describe, expect, it } from 'vitest';

import { groupSessionsByDay, seatTone, type AvailabilitySession } from '@/lib/utils/availability';

function session(overrides: Partial<AvailabilitySession>): AvailabilitySession {
  return {
    id: 'x',
    rwId: 5,
    label: 'Sesi Pagi',
    sessionDate: '2026-10-27',
    startTime: '08:30:00',
    endTime: '10:30:00',
    remaining: 40,
    capacity: 40,
    ...overrides,
  };
}

describe('seatTone', () => {
  it('is full at zero, few from a quarter down, open above', () => {
    expect(seatTone(0, 40)).toBe('full');
    expect(seatTone(-2, 40)).toBe('full');
    expect(seatTone(10, 40)).toBe('few');
    expect(seatTone(11, 40)).toBe('open');
    expect(seatTone(3, null)).toBe('open');
  });
});

describe('groupSessionsByDay', () => {
  it('groups by date in order and sums the seats', () => {
    const days = groupSessionsByDay([
      session({ id: 'b', sessionDate: '2026-10-28', remaining: 12 }),
      session({ id: 'a1' }),
      session({ id: 'a2', label: 'Sesi Siang', remaining: -1 }),
    ]);
    expect(days.map((day) => day.date)).toEqual(['2026-10-27', '2026-10-28']);
    expect(days[0]?.remaining).toBe(40);
    expect(days[0]?.capacity).toBe(80);
    expect(days[0]?.sessions.map((item) => item.id)).toEqual(['a1', 'a2']);
  });

  it('has no capacity for a day with a session without one', () => {
    expect(groupSessionsByDay([session({ capacity: null })])[0]?.capacity).toBeNull();
  });
});
