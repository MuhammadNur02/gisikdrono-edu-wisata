import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  countUpcomingVisits,
  dailyValuesOf,
  readProductsSoldThisMonth,
  readRevenueDays,
  readVisitDays,
} from '@/server/services/visit-stats-service';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const NOW = new Date('2026-11-18T03:00:00Z');

function sessionAnswering(answer: unknown): unknown[] {
  const bodies: unknown[] = [];
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (_input, init) => {
        bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
        return Promise.resolve(Response.json(answer));
      },
    },
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return bodies;
}

const bucket = (productsSold: number, day = '2026-11-01') => ({
  bucket: day,
  bookings: 3,
  pax_booked: 60,
  pax_checked_in: 40,
  tickets_used: 3,
  products_sold: productsSold,
  gross_amount: null,
});

describe('readProductsSoldThisMonth', () => {
  it('asks visit_stats for the RW from the first of the month to today', async () => {
    const bodies = sessionAnswering([bucket(17)]);
    await expect(readProductsSoldThisMonth(5, NOW)).resolves.toBe(17);
    expect(bodies).toEqual([
      { p_from: '2026-11-01', p_to: '2026-11-18', p_granularity: 'month', p_rw_id: 5 },
    ]);
  });

  it('reads zero for a month without sales, and refuses an answer of the wrong shape', async () => {
    sessionAnswering([bucket(0)]);
    await expect(readProductsSoldThisMonth(8, NOW)).resolves.toBe(0);
    sessionAnswering([{ bucket: '2026-11-01' }]);
    await expect(readProductsSoldThisMonth(8, NOW)).rejects.toBeDefined();
  });
});

describe('readVisitDays', () => {
  it('asks visit_stats for day buckets, the whole kelurahan without an RW', async () => {
    const bodies = sessionAnswering([bucket(1, '2026-11-17'), bucket(2, '2026-11-18')]);
    const days = await readVisitDays(null, '2026-11-17', '2026-11-18');
    expect(dailyValuesOf(days, (day) => day.pax_checked_in)).toEqual([
      { day: '2026-11-17', value: 40 },
      { day: '2026-11-18', value: 40 },
    ]);
    expect(bodies).toEqual([{ p_from: '2026-11-17', p_to: '2026-11-18', p_granularity: 'day' }]);
  });
});

describe('readRevenueDays', () => {
  it('sums the net amount of every beneficiary of a day', async () => {
    const recap = (day: string, beneficiaryKey: string, netAmount: number) => ({
      day,
      rw_id: 5,
      beneficiary_key: beneficiaryKey,
      settled_amount: netAmount,
      reversed_amount: 0,
      net_amount: netAmount,
      bookings: 1,
    });
    const bodies = sessionAnswering({
      daily: [
        recap('2026-11-17', 'kelurahan', 150_000),
        recap('2026-11-17', 'rw_treasury:5', 350_000),
        recap('2026-11-18', 'kelurahan', -50_000),
      ],
      by_beneficiary: [],
      outstanding: [],
    });
    await expect(readRevenueDays(5, '2026-11-01', '2026-11-18')).resolves.toEqual([
      { day: '2026-11-17', value: 500_000 },
      { day: '2026-11-18', value: -50_000 },
    ]);
    expect(bodies).toEqual([{ p_from: '2026-11-01', p_to: '2026-11-18', p_rw_id: 5 }]);
  });
});

describe('countUpcomingVisits', () => {
  it('counts the paid bookings that visit the RW from today to 30 days ahead', async () => {
    const bodies = sessionAnswering([bucket(0, '2026-11-01'), bucket(0, '2026-12-01')]);
    await expect(countUpcomingVisits(8, '2026-11-18')).resolves.toBe(6);
    expect(bodies).toEqual([
      { p_from: '2026-11-18', p_to: '2026-12-18', p_granularity: 'month', p_rw_id: 8 },
    ]);
  });
});
