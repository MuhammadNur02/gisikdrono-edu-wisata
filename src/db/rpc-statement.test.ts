import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { importMidtransStatement } from './rpc-statement';
import { clientAnswering } from '../../tests/fixtures/postgrest-client';

const RUN_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const ROWS = [{ orderId: 'GSK-7F3K9Q2M-01', status: 'settlement', grossAmount: '300000' }];

describe('importMidtransStatement', () => {
  it('sends the rows in the shape of the SQL function and reads its summary', async () => {
    const { client, requests } = clientAnswering(200, {
      run_id: RUN_ID,
      rows_checked: 1,
      issues_found: 0,
    });
    await expect(importMidtransStatement(client, 'okt.csv', ROWS)).resolves.toEqual({
      runId: RUN_ID,
      rowsChecked: 1,
      issuesFound: 0,
    });
    expect(requests[0]?.url).toContain('/rest/v1/rpc/import_midtrans_statement');
    expect(requests[0]?.body).toEqual({
      p_file_name: 'okt.csv',
      p_rows: [{ order_id: 'GSK-7F3K9Q2M-01', status: 'settlement', gross_amount: '300000' }],
    });
  });

  it('throws the PostgREST error unchanged, so its hint can be read', async () => {
    const { client } = clientAnswering(400, {
      code: 'P0001',
      hint: 'STATEMENT_INVALID',
      message: 'x',
    });
    await expect(importMidtransStatement(client, 'okt.csv', ROWS)).rejects.toMatchObject({
      code: 'P0001',
      hint: 'STATEMENT_INVALID',
    });
  });

  it('refuses a reply of another shape', async () => {
    const { client } = clientAnswering(200, { run_id: RUN_ID });
    await expect(importMidtransStatement(client, 'okt.csv', ROWS)).rejects.toBeInstanceOf(ZodError);
  });
});
