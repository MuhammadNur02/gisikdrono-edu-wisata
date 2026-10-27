import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { StatementRow } from '@/lib/midtrans/statement-csv';
import type { StatementImportSummary } from '@/types/midtrans-statement';

// public.import_midtrans_statement (Task P4.7.05, 20261104190600) on the superadmin's session client: the function
// checks the role and the fresh authenticator code itself and writes the run, its issues and the audit row.

const importedSchema = z
  .object({
    run_id: z.uuid(),
    rows_checked: z.int().nonnegative(),
    issues_found: z.int().nonnegative(),
  })
  .strict();

export async function importMidtransStatement(
  client: DatabaseClient,
  fileName: string,
  rows: readonly StatementRow[],
): Promise<StatementImportSummary> {
  const args = {
    p_file_name: fileName,
    p_rows: rows.map((row) => ({
      order_id: row.orderId,
      status: row.status,
      gross_amount: row.grossAmount,
    })),
  };
  const reply = importedSchema.parse(await resultOf(client.rpc('import_midtrans_statement', args)));
  return { runId: reply.run_id, rowsChecked: reply.rows_checked, issuesFound: reply.issues_found };
}
