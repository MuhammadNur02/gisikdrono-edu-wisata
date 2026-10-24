import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { loadListQuery } from '@/lib/utils/list-query';

import { listScanHistory, listTodayAttendance } from './attendance-service';

// A PostgREST stand-in that records every request and answers from `replies` by table.
interface FakeServer {
  requests: URL[];
  replies: Partial<Record<string, unknown[]>>;
}
const server = vi.hoisted((): FakeServer => ({ requests: [], replies: {} }));

const fakeFetch: typeof fetch = (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  server.requests.push(url);
  const table = url.pathname.split('/').pop() ?? '';
  const rows = server.replies[table] ?? [];
  const range = rows.length === 0 ? '*' : `0-${String(rows.length - 1)}`;
  return Promise.resolve(
    new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': `${range}/${String(rows.length)}`,
      },
    }),
  );
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

const SCAN = {
  id: 7,
  scanned_at: '2026-10-24T02:05:00Z',
  scanned_by: 'officer-1',
  phase: 'check_in',
  result: 'ok',
  source: 'qr',
  attendee_count: 38,
  tickets_qr: {
    ticket_code: 'GSK-7F3K9Q2M-05',
    rw_id: 5,
    pax_count: 40,
    checked_in_pax: 38,
    unpaid_pax: 0,
    visit_sessions: { label: 'Pagi', start_time: '08:00:00', end_time: '10:00:00' },
  },
};

function requestTo(table: string): URL {
  const found = server.requests.find((url) => url.pathname.endsWith(`/${table}`));
  if (!found) throw new Error(`no request to ${table}`);
  return found;
}

beforeEach(() => {
  server.requests = [];
  server.replies = {};
});

describe('listScanHistory', () => {
  it('reads one Semarang day of one RW, narrowed to the results asked for, newest first', async () => {
    server.replies = { ticket_scans: [SCAN], profiles: [{ id: 'officer-1', full_name: 'Siti' }] };
    const query = loadListQuery({ status: 'ok,already_used,nope', q: 'GSK-7F' });
    const result = await listScanHistory(query, 5, '2026-10-24');

    const search = decodeURIComponent(requestTo('ticket_scans').search);
    expect(search).toContain('scanned_at=gte.2026-10-23T17:00:00.000Z');
    expect(search).toContain('scanned_at=lt.2026-10-24T17:00:00.000Z');
    expect(search).toContain('tickets_qr.rw_id=eq.5');
    expect(search).toContain('result=in.(ok,already_used)');
    expect(search).toContain('tickets_qr.ticket_code=ilike.%GSK-7F%');
    expect(search).toContain('order=scanned_at.desc,id.desc');
    expect(result).toEqual({
      total: 1,
      rows: [
        expect.objectContaining({
          id: '7',
          ticketCode: 'GSK-7F3K9Q2M-05',
          sessionLabel: 'Pagi',
          checkedInPax: 38,
          bookedPax: 40,
          officerName: 'Siti',
        }),
      ],
    });
  });

  it('leaves the RW to RLS for every RW and names no officer RLS hides', async () => {
    server.replies = { ticket_scans: [SCAN], profiles: [] };
    const result = await listScanHistory(loadListQuery({}), null, '2026-10-24');
    expect(decodeURIComponent(requestTo('ticket_scans').search)).not.toContain('tickets_qr.rw_id=');
    expect(result.rows[0]?.officerName).toBeNull();
  });

  it('asks for no profiles when the day has no scans', async () => {
    await listScanHistory(loadListQuery({}), 5, '2026-10-24');
    expect(server.requests.some((url) => url.pathname.endsWith('/profiles'))).toBe(false);
  });
});

describe('listTodayAttendance', () => {
  it('reads v_attendance_today for one RW with no contact column', async () => {
    server.replies = {
      v_attendance_today: [
        {
          ticket_id: 't1',
          ticket_code: 'GSK-7F3K9Q2M-05',
          institution_name: 'SD Negeri 1',
          pic_first_name: 'Siti',
          session_label: 'Pagi',
          start_time: '08:00:00',
          end_time: '10:00:00',
          ticket_status: 'used',
          booked_pax: 40,
          checked_in_pax: 38,
          unpaid_pax: 0,
          checked_in_at: '2026-10-24T01:10:00Z',
          is_manual: false,
        },
      ],
    };
    const tickets = await listTodayAttendance(5);
    const search = decodeURIComponent(requestTo('v_attendance_today').search);
    expect(search).toContain('rw_id=eq.5');
    expect(search).not.toMatch(/phone|email/);
    expect(tickets).toEqual([expect.objectContaining({ ticketId: 't1', checkedInPax: 38 })]);
  });
});
