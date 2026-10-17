import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runSql } from '../../scripts/local-stack';

// Official numbers taken by sessions at the same moment (Task P1.9.05, docs/Security.md REC-05): each call is its
// own transaction on its own connection and keeps the period's counter locked for a moment after it took a number,
// so the others queue on it. The numbers still come out consecutive, and one taken by a transaction that then fails
// goes to the next document. The suite uses a period no real document has and removes its counter afterwards.

const ISSUED_AT = '2099-06-01 10:00+07';
const PERIOD = '2099';
const PARALLEL_CALLS = 20;
const SLOW_TEST_MS = 60_000;

const numberRowsSchema = z.array(z.object({ number: z.string() }));

// The CTE runs the volatile function first; the sleep afterwards keeps its row lock held while the others wait.
async function takeCreditNoteNumber(): Promise<string> {
  const rows = await runSql(`with taken as (
      select internal.next_document_number('credit_note', '${ISSUED_AT}') as number
    )
    select number, pg_sleep(0.1)::text as waited from taken`);
  return numberRowsSchema.parse(rows)[0]?.number ?? '';
}

function creditNote(sequence: number): string {
  return `CN/GSK/${PERIOD}/${String(sequence).padStart(4, '0')}`;
}

describe('document numbers taken in parallel', () => {
  afterAll(async () => {
    await runSql(
      `delete from public.document_sequences where kind = 'credit_note' and period = '${PERIOD}'`,
    );
  }, SLOW_TEST_MS);

  it(
    'hands out every number of a period exactly once and in order',
    async () => {
      const numbers = await Promise.all(
        Array.from({ length: PARALLEL_CALLS }, () => takeCreditNoteNumber()),
      );

      expect([...numbers].sort()).toEqual(
        Array.from({ length: PARALLEL_CALLS }, (_, index) => creditNote(index + 1)),
      );
    },
    SLOW_TEST_MS,
  );

  it(
    'gives the number of a failed transaction to the next document',
    async () => {
      await expect(
        runSql(`select internal.next_document_number('credit_note', '${ISSUED_AT}');
                select 1 / 0;`),
      ).rejects.toThrow('division by zero');

      await expect(takeCreditNoteNumber()).resolves.toBe(creditNote(PARALLEL_CALLS + 1));
    },
    SLOW_TEST_MS,
  );
});
