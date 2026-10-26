import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';

import { countCheckInsToday, loadSuperadminOverview } from './dashboard-stats-service';

// PostgREST as supabase/config.toml runs it: never more than max_rows (100) rows per response, the exact count in
// Content-Range when asked for, 416 / PGRST103 for a range past the last row. The review of PR #45 (H1) found totals
// summed from the first 100 rows only; its re-review (L1) a 416 that took the whole overview down.
const MAX_ROWS = 100;
const PAX_PER_TICKET = 2;
const server = vi.hoisted(() => ({
  rows: 0,
  // Rows left once the first page has been read: rows that vanished between two pages.
  rowsAfterFirstPage: null as number | null,
  failingTable: null as string | null,
  requests: [] as string[],
  // What the stats RPCs answer: visit_stats day buckets and revenue_recap's daily rows.
  visitDays: [] as unknown[],
  revenueDays: [] as unknown[],
}));

function jsonReply(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// The stats RPCs answer one body, never pages.
function rpcReply(url: URL): Response | null {
  if (url.pathname.endsWith('/rpc/visit_stats')) return jsonReply(server.visitDays, 200);
  if (url.pathname.endsWith('/rpc/revenue_recap')) {
    return jsonReply({ daily: server.revenueDays, by_beneficiary: [], outstanding: [] }, 200);
  }
  return null;
}

// A statement timeout on the table or RPC the test names.
function failingReply(url: URL): Response | null {
  if (server.failingTable === null || !url.pathname.endsWith(`/${server.failingTable}`))
    return null;
  return jsonReply(
    { code: '57014', message: 'canceling statement', details: null, hint: null },
    500,
  );
}

function postgrestReply(url: URL): Response {
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? MAX_ROWS);
  const total =
    offset > 0 && server.rowsAfterFirstPage !== null ? server.rowsAfterFirstPage : server.rows;
  if (offset > 0 && offset >= total) {
    const error = {
      code: 'PGRST103',
      message: 'Requested range not satisfiable',
      details: null,
      hint: null,
    };
    return jsonReply(error, 416, { 'Content-Range': `*/${String(total)}` });
  }
  const end = Math.min(offset + Math.min(limit, MAX_ROWS), total);
  const body = Array.from({ length: Math.max(end - offset, 0) }, () => ({
    checked_in_pax: PAX_PER_TICKET,
  }));
  const range = body.length === 0 ? '*' : `${String(offset)}-${String(end - 1)}`;
  return jsonReply(body, 200, { 'Content-Range': `${range}/${String(total)}` });
}

const fakeFetch: typeof fetch = (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  server.requests.push(`${url.pathname}${url.search}`);
  return Promise.resolve(failingReply(url) ?? rpcReply(url) ?? postgrestReply(url));
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
// The failing KPI is logged by name; the test keeps the output quiet.
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));

beforeEach(() => {
  server.rows = 0;
  server.rowsAfterFirstPage = null;
  server.failingTable = null;
  server.requests = [];
  server.visitDays = [];
  server.revenueDays = [];
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
  it('keeps the other figures when one KPI fails to load', async () => {
    server.failingTable = 'reviews';
    const overview = await loadSuperadminOverview(null, new Date('2026-10-24T03:00:00Z'));
    expect(overview.rating).toBeNull();
    expect(overview.checkedInVisitors).toMatchObject({ value: 0 });
    expect(overview.revenue).toMatchObject({ value: 0 });
    expect(overview.paidBookings).toMatchObject({ value: 0 });
    expect(overview.piiRevealsToday).toBe(0);
  });

  it('reads the month figures from visit_stats and revenue_recap by day', async () => {
    const visitDay = (day: string, bookings: number, paxCheckedIn: number) => ({
      bucket: day,
      bookings,
      pax_booked: paxCheckedIn,
      pax_checked_in: paxCheckedIn,
      tickets_used: bookings,
      products_sold: 0,
      gross_amount: null,
    });
    // 24 October against the same days of September; 20 September lies inside, 30 September past them.
    server.visitDays = [
      visitDay('2026-09-20', 2, 30),
      visitDay('2026-09-30', 9, 90),
      visitDay('2026-10-03', 3, 45),
      visitDay('2026-10-24', 1, 15),
    ];
    server.revenueDays = [
      { day: '2026-10-03', beneficiary_key: 'kelurahan', net_amount: 100_000 },
      { day: '2026-10-03', beneficiary_key: 'rw_treasury:5', net_amount: 400_000 },
    ];
    const overview = await loadSuperadminOverview(null, new Date('2026-10-24T03:00:00Z'));
    expect(overview.paidBookings).toEqual({ value: 4, trend: { direction: 'up', percent: 100 } });
    expect(overview.checkedInVisitors).toMatchObject({
      value: 60,
      trend: { direction: 'up', percent: 100 },
    });
    expect(overview.revenue).toMatchObject({ value: 500_000 });
    expect(server.requests.some((request) => request.includes('v_bookings_staff'))).toBe(false);
    expect(server.requests.some((request) => request.includes('tickets_qr'))).toBe(false);
  });

  it('shows no visit figures, and still the revenue, when visit_stats fails', async () => {
    server.failingTable = 'visit_stats';
    const overview = await loadSuperadminOverview(null, new Date('2026-10-24T03:00:00Z'));
    expect(overview.paidBookings).toBeNull();
    expect(overview.checkedInVisitors).toBeNull();
    expect(overview.revenue).toMatchObject({ value: 0 });
  });
});
