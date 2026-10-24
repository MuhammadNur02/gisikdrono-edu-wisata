import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';

import { countCheckInsToday } from './dashboard-stats-service';

// PostgREST as supabase/config.toml runs it: never more than max_rows (100) rows per response, the exact count in
// Content-Range when asked for. The review of PR #45 (H1) found totals summed from the first 100 rows only.
const MAX_ROWS = 100;
const PAX_PER_TICKET = 2;
const server = vi.hoisted(() => ({ rows: 0, requests: [] as string[] }));

function postgrestReply(url: URL): Response {
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? MAX_ROWS);
  const end = Math.min(offset + Math.min(limit, MAX_ROWS), server.rows);
  const body = Array.from({ length: Math.max(end - offset, 0) }, () => ({
    checked_in_pax: PAX_PER_TICKET,
  }));
  const range = body.length === 0 ? '*' : `${String(offset)}-${String(end - 1)}`;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': `${range}/${String(server.rows)}`,
    },
  });
}

const fakeFetch: typeof fetch = (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  server.requests.push(url.search);
  return Promise.resolve(postgrestReply(url));
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

beforeEach(() => {
  server.rows = 0;
  server.requests = [];
});

describe('countCheckInsToday', () => {
  it('sums every ticket of today, past the 100 rows of one response', async () => {
    server.rows = 250;
    expect(await countCheckInsToday(5)).toBe(250 * PAX_PER_TICKET);
    expect(server.requests).toHaveLength(3);
    expect(server.requests.every((search) => search.includes('rw_id=eq.5'))).toBe(true);
  });

  it('is zero for a quiet day', async () => {
    expect(await countCheckInsToday(null)).toBe(0);
  });

  it('gives no figure, never a partial one, past the ceiling', async () => {
    server.rows = 2_500;
    expect(await countCheckInsToday(null)).toBeNull();
    expect(server.requests).toHaveLength(1);
  });
});
