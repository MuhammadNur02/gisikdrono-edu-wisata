import { describe, expect, it, vi } from 'vitest';

import { occupancyRowsOf } from './dashboard-today-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const DAYS = ['2026-11-15', '2026-11-16', '2026-11-17'];

function session(rwId: number, day: string, capacity: number, reserved: number) {
  return { rw_id: rwId, session_date: day, capacity, reserved_pax: reserved };
}

describe('occupancyRowsOf', () => {
  it('gives each RW one row over every day, sessions of a day summed', () => {
    const rows = occupancyRowsOf(
      [
        session(13, '2026-11-15', 40, 40),
        session(5, '2026-11-15', 30, 15),
        session(5, '2026-11-15', 30, 30),
        session(5, '2026-11-17', 20, 5),
      ],
      DAYS,
    );
    expect(rows.map((row) => row.rwId)).toEqual([5, 13]);
    expect(rows[0]?.cells).toEqual([
      { day: '2026-11-15', percent: 75, isFull: false },
      { day: '2026-11-16', percent: null, isFull: false },
      { day: '2026-11-17', percent: 25, isFull: false },
    ]);
    expect(rows[1]?.cells[0]).toEqual({ day: '2026-11-15', percent: 100, isFull: true });
  });

  it('leaves out an RW without a session in the window', () => {
    expect(occupancyRowsOf([], DAYS)).toEqual([]);
  });
});
