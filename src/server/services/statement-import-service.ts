import 'server-only';

import { importMidtransStatement } from '@/db/rpc-statement';
import { statementCopy } from '@/lib/copy/midtrans-statement';
import { AppError, raisedHintOf } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ImportStatementValues } from '@/lib/validations/midtrans-statement';
import type { StatementImportSummary } from '@/types/midtrans-statement';

// Task P4.7.05 (docs/Security.md REC-02): the Midtrans statement compared with the payments through the superadmin's
// session client, so import_midtrans_statement sees auth.uid() and its own role and fresh-code check. A statement the
// function refuses (STATEMENT_INVALID) reads as a form error, since the schema in front of it should have caught it.
const STATEMENT_INVALID = 'STATEMENT_INVALID';

export async function importStatement(
  values: ImportStatementValues,
): Promise<StatementImportSummary> {
  const supabase = await createSupabaseServerClient();
  try {
    return await importMidtransStatement(supabase, values.fileName, values.rows);
  } catch (error) {
    if (raisedHintOf(error) === STATEMENT_INVALID)
      throw new AppError('VALIDATION', statementCopy.invalid);
    throw error;
  }
}
