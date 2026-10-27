import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importMidtransStatement } from '@/db/rpc-statement';
import { statementCopy } from '@/lib/copy/midtrans-statement';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { importStatement } from './statement-import-service';

vi.mock('@/db/rpc-statement', () => ({ importMidtransStatement: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const CLIENT = { name: 'session client' };
const VALUES = {
  fileName: 'okt.csv',
  rows: [{ orderId: 'GSK-7F3K9Q2M-01', status: 'settlement', grossAmount: '300000' }],
};

beforeEach(() => {
  vi.mocked(createSupabaseServerClient)
    .mockReset()
    .mockResolvedValue(CLIENT as never);
  vi.mocked(importMidtransStatement).mockReset();
});

describe('importStatement', () => {
  it('calls the function on the session client', async () => {
    const summary = { runId: 'run-1', rowsChecked: 1, issuesFound: 1 };
    vi.mocked(importMidtransStatement).mockResolvedValueOnce(summary);
    await expect(importStatement(VALUES)).resolves.toEqual(summary);
    expect(importMidtransStatement).toHaveBeenCalledWith(CLIENT, 'okt.csv', VALUES.rows);
  });

  it('reads STATEMENT_INVALID as a form error', async () => {
    vi.mocked(importMidtransStatement).mockRejectedValueOnce({
      code: 'P0001',
      hint: 'STATEMENT_INVALID',
    });
    await expect(importStatement(VALUES)).rejects.toEqual(
      new AppError('VALIDATION', statementCopy.invalid),
    );
  });

  it('passes any other error on', async () => {
    const refusal = { code: '42501', hint: null };
    vi.mocked(importMidtransStatement).mockRejectedValueOnce(refusal);
    await expect(importStatement(VALUES)).rejects.toBe(refusal);
  });
});
