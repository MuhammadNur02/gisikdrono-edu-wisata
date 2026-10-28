'use server';

import { revalidatePath } from 'next/cache';

import { STATEMENT_IMPORT_PATH } from '@/config/midtrans-statement';
import { STAFF_STEP_UP_MAX_AGE_SECONDS } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { fail, mapError, ok } from '@/lib/errors';
import { importStatementSchema } from '@/lib/validations/midtrans-statement';
import { requireFreshTotp, requireRole } from '@/server/auth/guards';
import { importStatement } from '@/server/services/statement-import-service';
import type { ActionResult } from '@/types/action-result';
import type { StatementImportSummary } from '@/types/midtrans-statement';

// /dashboard/finance/reconciliation (Task P4.7.05, docs/Security.md REC-02): the superadmin compares the Midtrans
// dashboard's transaction statement with the payments by order_id. Unknown orders and amount or status differences
// become reconciliation issues of a csv_import run; nothing is applied. A fresh authenticator code confirms it
// (§5.3), as import_midtrans_statement requires.
export async function importMidtransCsvAction(
  input: unknown,
): Promise<ActionResult<StatementImportSummary>> {
  const parsed = importStatementSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS);
  if (!guard.ok) return fail('FORBIDDEN', undefined, staffCopy.notFresh);

  try {
    const summary = await importStatement(parsed.data);
    revalidatePath(STATEMENT_IMPORT_PATH);
    return ok(summary);
  } catch (error) {
    return mapError(error);
  }
}
