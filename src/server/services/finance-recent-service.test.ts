import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listRecentLedgerEntries } from './finance-recent-service';

interface Reply {
  data: unknown[];
  error: Error | null;
  calls: string[];
}

const reply = vi.hoisted((): Reply => ({ data: [], error: null, calls: [] }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => {
  const builder = {
    select: (columns: string) => {
      reply.calls.push(`select ${columns}`);
      return builder;
    },
    order: (column: string, options: { ascending: boolean }) => {
      reply.calls.push(`order ${column} ${String(options.ascending)}`);
      return builder;
    },
    limit: (count: number) => {
      reply.calls.push(`limit ${String(count)}`);
      return Promise.resolve({ data: reply.data, error: reply.error });
    },
  };
  return { createSupabaseServerClient: () => Promise.resolve({ from: () => builder }) };
});

beforeEach(() => {
  reply.data = [];
  reply.error = null;
  reply.calls = [];
});

describe('listRecentLedgerEntries', () => {
  it('reads the five newest rows, a reversal kept negative', async () => {
    reply.data = [
      {
        id: 12,
        created_at: '2026-11-17T02:14:00Z',
        entry_type: 'reversal',
        beneficiary_key: 'rw:5',
        amount: -405000,
      },
      {
        id: 11,
        created_at: '2026-11-16T02:14:00Z',
        entry_type: 'settlement',
        beneficiary_key: 'kelurahan',
        amount: 120000,
      },
    ];
    await expect(listRecentLedgerEntries()).resolves.toEqual([
      {
        id: 12,
        createdAt: '2026-11-17T02:14:00Z',
        entryType: 'reversal',
        beneficiaryKey: 'rw:5',
        amount: -405000,
      },
      {
        id: 11,
        createdAt: '2026-11-16T02:14:00Z',
        entryType: 'settlement',
        beneficiaryKey: 'kelurahan',
        amount: 120000,
      },
    ]);
    expect(reply.calls).toEqual([
      'select id, created_at, entry_type, beneficiary_key, amount',
      'order id false',
      'limit 5',
    ]);
  });

  it('refuses a row whose amount is not whole rupiah, and passes a read error on', async () => {
    reply.data = [
      { id: 1, created_at: 'x', entry_type: 'settlement', beneficiary_key: 'k', amount: 1.5 },
    ];
    await expect(listRecentLedgerEntries()).rejects.toThrow();
    reply.data = [];
    reply.error = new Error('denied');
    await expect(listRecentLedgerEntries()).rejects.toThrow('denied');
  });
});
