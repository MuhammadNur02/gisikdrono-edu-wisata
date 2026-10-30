import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';

import {
  countCheckInsToday,
  loadRwOverview,
  loadSuperadminOverview,
} from './dashboard-stats-service';

// PostgREST as supabase/config.toml runs it: never more than max_rows (100) rows per response, the exact count in
// Content-Range when asked for, 416 / PGRST103 for a range past the last row. The review of PR #45 (H1) found totals
// summed from the first 100 rows only; its re-review (L1) a 416 that took the whole overview down.
const MAX_ROWS = 100;
const PAX_PER_TICKET = 2;
const STATEMENT_TIMEOUT = '57014';
// 24 October 2026, 10:00 in Semarang.
const NOW = new Date('2026-10-24T03:00:00Z');

interface StatsCall {
  p_from: string;
  p_to: string;
  p_granularity?: string;
  p_rw_id?: number;
}

const server = vi.hoisted(() => ({
  rows: 0,
  // Rows left once the first page has been read: rows that vanished between two pages.
  rowsAfterFirstPage: null as number | null,
  failingTable: null as string | null,
  requests: [] as string[],
  // What the stats RPCs answer: visit_stats buckets for each call and revenue_recap's daily rows.
  visitStats: null as ((call: StatsCall) => unknown[]) | null,
  statsCalls: [] as StatsCall[],
  revenueDays: [] as unknown[],
}));
const logged = vi.hoisted(() => ({ error: vi.fn() }));

function jsonReply(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// The stats RPCs answer one body, never pages.
function rpcReply(url: URL, body: string | undefined): Response | null {
  if (url.pathname.endsWith('/rpc/visit_stats')) {
    const call = JSON.parse(body ?? '{}') as StatsCall;
    server.statsCalls.push(call);
    return jsonReply(server.visitStats?.(call) ?? [], 200);
  }
  if (url.pathname.endsWith('/rpc/revenue_recap')) {
    return jsonReply({ daily: server.revenueDays, by_beneficiary: [], outstanding: [] }, 200);
  }
  return null;
}

// A statement timeout on the table or RPC the test names.
function failingReply(url: URL): Response | null {
  if (server.failingTable === null || !url.pathname.endsWith(`/${server.failingTable}`))
    return null;
  const error = { code: STATEMENT_TIMEOUT, message: 'canceling statement', details: null };
  return jsonReply({ ...error, hint: null }, 500);
}

function postgrestReply(url: URL): Response {
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? MAX_ROWS);
  const total =
    offset > 0 && server.rowsAfterFirstPage !== null ? server.rowsAfterFirstPage : server.rows;
  if (offset > 0 && offset >= total) {
    const error = { code: 'PGRST103', message: 'Requested range not satisfiable', details: null };
    return jsonReply({ ...error, hint: null }, 416, { 'Content-Range': `*/${String(total)}` });
  }
  const end = Math.min(offset + Math.min(limit, MAX_ROWS), total);
  const body = Array.from({ length: Math.max(end - offset, 0) }, () => ({
    checked_in_pax: PAX_PER_TICKET,
  }));
  const range = body.length === 0 ? '*' : `${String(offset)}-${String(end - 1)}`;
  return jsonReply(body, 200, { 'Content-Range': `${range}/${String(total)}` });
}

const fakeFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  server.requests.push(`${url.pathname}${url.search}`);
  const body = typeof init?.body === 'string' ? init.body : undefined;
  return Promise.resolve(failingReply(url) ?? rpcReply(url, body) ?? postgrestReply(url));
};

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve(
      createClient<Database>('http://127.0.0.1:54321', 'fixture-anon-key', {
        global: { fetch: fakeFetch },
        auth: { persistSession: false },
      }),
    ),
}));
// The failing KPI is logged by name and code (review of PR #93, I-2); the spy keeps the output quiet.
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: logged.error }) }));

function bucket(day: string, figures: { bookings?: number; paxCheckedIn?: number; sold?: number }) {
  return {
    bucket: day,
    bookings: figures.bookings ?? 0,
    pax_booked: figures.paxCheckedIn ?? 0,
    pax_checked_in: figures.paxCheckedIn ?? 0,
    tickets_used: figures.bookings ?? 0,
    products_sold: figures.sold ?? 0,
    gross_amount: null,
  };
}

function expectLoggedFailure(kpi: string) {
  expect(logged.error).toHaveBeenCalledWith(
    'internal_error',
    expect.objectContaining({ kpi, code: STATEMENT_TIMEOUT }),
  );
}

beforeEach(() => {
  server.rows = 0;
  server.rowsAfterFirstPage = null;
  server.failingTable = null;
  server.requests = [];
  server.visitStats = null;
  server.statsCalls = [];
  server.revenueDays = [];
  logged.error.mockClear();
});

describe('countCheckInsToday', () => {
  it('sums every ticket of today, past the 100 rows of one response', async () => {
    server.rows = 250;
    expect(await countCheckInsToday(5)).toBe(250 * PAX_PER_TICKET);
    expect(server.requests).toHaveLength(3);
    expect(server.requests.every((request) => request.includes('rw_id=eq.5'))).toBe(true);
  });

  it('is zero for a quiet day', async () => {
    expect(await countCheckInsToday(null)).toBe(0);
  });

  it('gives no figure, never a partial one, past the ceiling', async () => {
    server.rows = 2_500;
    expect(await countCheckInsToday(null)).toBeNull();
    expect(server.requests).toHaveLength(1);
  });

  it('gives no figure when rows vanish between pages and the next range answers 416', async () => {
    server.rows = 150;
    server.rowsAfterFirstPage = 90;
    expect(await countCheckInsToday(null)).toBeNull();
  });
});

describe('loadSuperadminOverview', () => {
  it('keeps the other figures when one KPI fails to load, and logs it by name and code', async () => {
    server.failingTable = 'reviews';
    const overview = await loadSuperadminOverview(null, NOW);
    expect(overview.rating).toBeNull();
    expect(overview.checkedInVisitors).toMatchObject({ value: 0 });
    expect(overview.revenue).toMatchObject({ value: 0 });
    expect(overview.paidBookings).toMatchObject({ value: 0 });
    expect(overview.piiRevealsToday).toBe(0);
    expectLoggedFailure('rating');
  });

  it('counts paid bookings per month, and the rest by day, from the stats RPCs', async () => {
    // 1 to 24 October against 1 to 24 September. The month buckets count a combo on two days once (3), the day
    // buckets would count it twice (4).
    server.visitStats = (call) => {
      if (call.p_granularity === 'month') {
        return [bucket(call.p_from, { bookings: call.p_from === '2026-10-01' ? 3 : 2 })];
      }
      return [
        bucket('2026-09-20', { bookings: 2, paxCheckedIn: 30 }),
        bucket('2026-09-30', { bookings: 9, paxCheckedIn: 90 }),
        bucket('2026-10-03', { bookings: 3, paxCheckedIn: 45 }),
        bucket('2026-10-24', { bookings: 1, paxCheckedIn: 15 }),
      ];
    };
    server.revenueDays = [
      { day: '2026-10-03', beneficiary_key: 'kelurahan', net_amount: 100_000 },
      { day: '2026-10-03', beneficiary_key: 'rw_treasury:5', net_amount: 400_000 },
    ];
    const overview = await loadSuperadminOverview(null, NOW);
    expect(overview.paidBookings).toEqual({ value: 3, trend: { direction: 'up', percent: 50 } });
    expect(server.statsCalls.filter((call) => call.p_granularity === 'month')).toEqual([
      { p_from: '2026-10-01', p_to: '2026-10-24', p_granularity: 'month' },
      { p_from: '2026-09-01', p_to: '2026-09-24', p_granularity: 'month' },
    ]);
    expect(overview.checkedInVisitors).toMatchObject({
      value: 60,
      trend: { direction: 'up', percent: 100 },
    });
    expect(overview.revenue).toMatchObject({ value: 500_000 });
    const rowReads = server.requests.filter((request) =>
      /v_bookings_staff|tickets_qr/.test(request),
    );
    expect(rowReads).toEqual([]);
  });

  it('shows no visit figures, and still the revenue, when visit_stats fails', async () => {
    server.failingTable = 'visit_stats';
    const overview = await loadSuperadminOverview(null, NOW);
    expect(overview.paidBookings).toBeNull();
    expect(overview.checkedInVisitors).toBeNull();
    expect(overview.revenue).toMatchObject({ value: 0 });
    expectLoggedFailure('visit_stats');
  });

  it('shows no revenue, and still the visit figures, when revenue_recap fails', async () => {
    server.failingTable = 'revenue_recap';
    const overview = await loadSuperadminOverview(null, NOW);
    expect(overview.revenue).toBeNull();
    expect(overview.paidBookings).toMatchObject({ value: 0 });
    expect(overview.checkedInVisitors).toMatchObject({ value: 0 });
    expectLoggedFailure('revenue');
  });
});

describe('loadRwOverview', () => {
  it('reads upcoming visits from month buckets from tomorrow, and the chart from day buckets', async () => {
    server.visitStats = (call) => {
      if (call.p_granularity === 'day') return [bucket('2026-10-20', { paxCheckedIn: 25 })];
      if (call.p_from === '2026-10-25') {
        return [bucket('2026-10-01', { bookings: 2 }), bucket('2026-11-01', { bookings: 3 })];
      }
      return [];
    };
    const overview = await loadRwOverview(5, NOW);
    expect(overview.upcomingBookings).toBe(5);
    expect(server.statsCalls).toContainEqual({
      p_from: '2026-10-25',
      p_to: '2026-11-23',
      p_granularity: 'month',
      p_rw_id: 5,
    });
    expect(server.statsCalls).toContainEqual({
      p_from: '2026-09-25',
      p_to: '2026-10-24',
      p_granularity: 'day',
      p_rw_id: 5,
    });
    expect(overview.checkIns).toHaveLength(30);
    expect(overview.checkIns?.find((point) => point.day === '2026-10-20')?.value).toBe(25);
    expect(overview.checkIns?.at(-1)).toEqual({ day: '2026-10-24', value: 0 });
  });

  it('shows no chart or visit counts when visit_stats fails, and still today at the gate', async () => {
    server.failingTable = 'visit_stats';
    const overview = await loadRwOverview(5, NOW);
    expect(overview.checkIns).toBeNull();
    expect(overview.upcomingBookings).toBeNull();
    expect(overview.checkInsToday).toBe(0);
    expect(overview.todaySessions).toEqual([]);
    expectLoggedFailure('check_ins');
  });
});
