import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { readProductsSoldThisMonth } from '@/server/services/visit-stats-service';

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

const bucket = (productsSold: number) => ({
  bucket: '2026-11-01',
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
