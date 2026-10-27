import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadRwFinanceRecap } from '@/server/services/finance-service';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const PERIOD = { from: '2026-10-01', to: '2026-10-27' };
const VENDOR_KEY = 'vendor:0de00000-0000-4000-8000-0000000000a5';

// The session client answering every request with one body, recording what it was asked.
function sessionAnswering(answer: unknown): { path: string; body: unknown }[] {
  const calls: { path: string; body: unknown }[] = [];
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
        calls.push({ path: url.pathname, body });
        return Promise.resolve(Response.json(answer));
      },
    },
  });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return calls;
}

const daily = (day: string, beneficiaryKey: string, net: number) => ({
  day,
  rw_id: 5,
  beneficiary_key: beneficiaryKey,
  settled_amount: net,
  reversed_amount: 0,
  net_amount: net,
  bookings: 1,
});

const party = (beneficiary: string, beneficiaryKey: string, accrued: number, paidOut: number) => ({
  beneficiary,
  beneficiary_key: beneficiaryKey,
  beneficiary_name: beneficiary === 'kelurahan' ? null : 'Nama pihak',
  rw_id: beneficiary === 'kelurahan' ? null : 5,
  accrued,
  paid_out: paidOut,
  outstanding: accrued - paidOut,
});

describe('loadRwFinanceRecap', () => {
  it('reads revenue_recap alone and sums the RW treasury and vendors on the server', async () => {
    const calls = sessionAnswering({
      daily: [
        daily('2026-10-03', 'rw:5', 400_000),
        daily('2026-10-03', VENDOR_KEY, 90_000),
        daily('2026-10-05', 'rw:5', -40_000),
      ],
      by_beneficiary: [
        {
          beneficiary_key: 'rw:5',
          rw_id: 5,
          settled_amount: 400_000,
          reversed_amount: -40_000,
          net_amount: 360_000,
        },
        {
          beneficiary_key: VENDOR_KEY,
          rw_id: 5,
          settled_amount: 90_000,
          reversed_amount: 0,
          net_amount: 90_000,
        },
      ],
      outstanding: [
        party('rw_treasury', 'rw:5', 360_000, 200_000),
        party('umkm_vendor', VENDOR_KEY, 90_000, 0),
      ],
    });
    const recap = await loadRwFinanceRecap(PERIOD);
    expect(calls).toEqual([
      { path: '/rest/v1/rpc/revenue_recap', body: { p_from: PERIOD.from, p_to: PERIOD.to } },
    ]);
    expect(recap.totals).toEqual({
      settled: 490_000,
      reversed: -40_000,
      net: 450_000,
      outstanding: 250_000,
    });
    expect(recap.days).toEqual([
      { day: '2026-10-03', net: 490_000 },
      { day: '2026-10-05', net: -40_000 },
    ]);
    expect(recap.balances.map((balance) => balance.beneficiaryKey)).toEqual(['rw:5', VENDOR_KEY]);
  });

  it('shows the RW parties only, never a kelurahan row', async () => {
    sessionAnswering({
      daily: [],
      by_beneficiary: [
        {
          beneficiary_key: 'kelurahan',
          rw_id: null,
          settled_amount: 100_000,
          reversed_amount: 0,
          net_amount: 100_000,
        },
      ],
      outstanding: [party('kelurahan', 'kelurahan', 100_000, 0)],
    });
    const recap = await loadRwFinanceRecap(PERIOD);
    expect(recap.shares).toEqual([]);
    expect(recap.balances).toEqual([]);
    expect(recap.totals).toEqual({ settled: 0, reversed: 0, net: 0, outstanding: 0 });
  });

  it('refuses an answer of the wrong shape', async () => {
    sessionAnswering({ daily: [], by_beneficiary: [] });
    await expect(loadRwFinanceRecap(PERIOD)).rejects.toBeDefined();
  });
});
