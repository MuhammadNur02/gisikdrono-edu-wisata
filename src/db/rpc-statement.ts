import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { StatementPeriod, StatementRow } from '@/lib/midtrans/statement-csv';
import type { StatementImportSummary } from '@/types/midtrans-statement';

// public.import_midtrans_statement (Task P4.7.05, 20261104190600) on the superadmin's session client: the function
// checks the role, the fresh authenticator code and its hourly limit itself and writes the run, its issues and the
// audit row. A statement imported before answers with its earlier run (review of PR #99, M1).

const importedSchema = z
  .object({
    run_id: z.uuid(),
    rows_checked: z.int().nonnegative(),
    issues_found: z.int().nonnegative(),
    issues_already_open: z.int().nonnegative(),
    already_imported: z.boolean(),
  })
  .strict();

export interface StatementImport {
  fileName: string;
  rows: readonly StatementRow[];
  period: StatementPeriod | null;
}

export async function importMidtransStatement(
  client: DatabaseClient,
  statement: StatementImport,
): Promise<StatementImportSummary> {
  const args = {
    p_file_name: statement.fileName,
    p_rows: statement.rows.map((row) => ({
      order_id: row.orderId,
      status: row.status,
      gross_amount: row.grossAmount,
    })),
    ...(statement.period
      ? { p_period_from: statement.period.from, p_period_to: statement.period.to }
      : {}),
  };
  const reply = importedSchema.parse(await resultOf(client.rpc('import_midtrans_statement', args)));
  return {
    runId: reply.run_id,
    rowsChecked: reply.rows_checked,
    issuesFound: reply.issues_found,
    issuesAlreadyOpen: reply.issues_already_open,
    alreadyImported: reply.already_imported,
  };
}
