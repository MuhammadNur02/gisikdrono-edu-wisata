import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { Database } from '@/db/types';

import { listOpenIssues } from './reconciliation-service';

vi.mock('server-only', () => ({}));

// A PostgREST stand-in answering every request with `rows`.
const server = vi.hoisted(() => ({ rows: [] as unknown[] }));

const fakeFetch: typeof fetch = () =>
  Promise.resolve(
    new Response(JSON.stringify(server.rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve(
      createClient<Database>('http://127.0.0.1:54321', 'fixture-anon-key', {
        global: { fetch: fakeFetch },
        auth: { persistSession: false },
      }),
    ),
}));

const ISSUE = {
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000a1',
  run_id: '0192f3a4-5b6c-7d8e-9f01-0000000000a2',
  booking_id: null,
  payment_id: null,
  issue_type: 'unknown_order',
  severity: 'medium',
  created_at: '2026-10-27T02:00:00Z',
  resolved_at: null,
  resolution: null,
  resolution_note: null,
  bookings: null,
  payments: null,
  details: {
    order_id: 'GSK-ZZZZZZZZ-01',
    midtrans_status: 'settlement',
    midtrans_amount: 1000,
    file_name: 'midtrans-oktober.csv',
  },
};
const NO_FILTER = { from: null, to: null };

beforeEach(() => {
  server.rows = [];
});

// Review of PR #99, M2: a statement issue shows its order and what Midtrans said beside what the payment holds.
describe('listOpenIssues', () => {
  it('names an unknown order from the issue itself, with Midtrans figures', async () => {
    server.rows = [ISSUE];
    const { items } = await listOpenIssues(NO_FILTER);
    expect(items[0]).toMatchObject({
      orderId: 'GSK-ZZZZZZZZ-01',
      statement: { midtransStatus: 'settlement', midtransAmount: 1000, ourStatus: null, ourAmount: null },
    });
  });

  it('prefers the payment order and shows both sides of a difference', async () => {
    server.rows = [
      {
        ...ISSUE,
        payment_id: '0192f3a4-5b6c-7d8e-9f01-0000000000a3',
        issue_type: 'amount_mismatch',
        payments: { order_id: 'GSK-SC0000A3-01' },
        details: { ...ISSUE.details, order_id: 'GSK-SC0000A3-01', our_status: 'settled', our_amount: 70000 },
      },
    ];
    const { items } = await listOpenIssues(NO_FILTER);
    expect(items[0]).toMatchObject({
      orderId: 'GSK-SC0000A3-01',
      statement: { midtransStatus: 'settlement', ourStatus: 'settled', ourAmount: 70000 },
    });
  });

  it('leaves an issue of another run without statement facts', async () => {
    server.rows = [{ ...ISSUE, issue_type: 'pending_beyond_ttl', details: {} }];
    const { items } = await listOpenIssues(NO_FILTER);
    expect(items[0]).toMatchObject({ orderId: null, statement: null });
  });

  it('reads a key gap, which names an amount but no Midtrans status, as no statement issue (L-a)', async () => {
    server.rows = [
      {
        ...ISSUE,
        issue_type: 'amount_mismatch',
        payment_id: '0192f3a4-5b6c-7d8e-9f01-0000000000a3',
        payments: { order_id: 'GSK-SC0000A3-01' },
        details: { reason: 'refund_key_mismatch_released', midtrans_amount: 60000, booked_amount: 70000 },
      },
    ];
    const { items } = await listOpenIssues(NO_FILTER);
    expect(items[0]).toMatchObject({ orderId: 'GSK-SC0000A3-01', statement: null });
  });

  it('refuses details of another shape', async () => {
    server.rows = [{ ...ISSUE, details: { midtrans_amount: 'seribu' } }];
    await expect(listOpenIssues(NO_FILTER)).rejects.toBeInstanceOf(ZodError);
  });
});
