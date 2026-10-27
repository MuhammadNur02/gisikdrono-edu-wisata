import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { importMidtransStatement } from './rpc-statement';
import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const RUN_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const ROWS = [{ orderId: 'GSK-7F3K9Q2M-01', status: 'settlement', grossAmount: '300000' }];
const STATEMENT = { fileName: 'okt.csv', rows: ROWS, period: null };
const REPLY = {
  run_id: RUN_ID,
  rows_checked: 1,
  issues_found: 0,
  issues_already_open: 0,
  already_imported: false,
};

describe('importMidtransStatement', () => {
  it('sends the rows in the shape of the SQL function and reads its summary', async () => {
    const { client, requests } = clientAnswering(200, REPLY);
    await expect(importMidtransStatement(client, STATEMENT)).resolves.toEqual({
      runId: RUN_ID,
      rowsChecked: 1,
      issuesFound: 0,
      issuesAlreadyOpen: 0,
      alreadyImported: false,
    });
    expect(requests[0]?.url).toContain('/rest/v1/rpc/import_midtrans_statement');
    expect(requests[0]?.body).toEqual({
      p_file_name: 'okt.csv',
      p_rows: [{ order_id: 'GSK-7F3K9Q2M-01', status: 'settlement', gross_amount: '300000' }],
    });
  });

  it('sends the period when the file had one, and reads a repeat as the earlier run (review of PR #99)', async () => {
    const { client, requests } = clientAnswering(200, { ...REPLY, already_imported: true });
    const period = { from: '2026-10-01', to: '2026-10-31' };
    await expect(importMidtransStatement(client, { ...STATEMENT, period })).resolves.toMatchObject({
      alreadyImported: true,
    });
    expect(requests[0]?.body).toMatchObject({ p_period_from: '2026-10-01', p_period_to: '2026-10-31' });
  });

  it('throws the PostgREST error unchanged, so its hint can be read', async () => {
    const { client } = clientAnswering(400, {
      code: 'P0001',
      hint: 'STATEMENT_INVALID',
      message: 'x',
    });
    await expect(importMidtransStatement(client, STATEMENT)).rejects.toMatchObject({
      code: 'P0001',
      hint: 'STATEMENT_INVALID',
    });
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, { run_id: RUN_ID });
    await expect(importMidtransStatement(client, STATEMENT)).rejects.toBeInstanceOf(ZodError);
  });
});
