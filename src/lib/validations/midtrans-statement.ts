import { z } from 'zod';

import { STATEMENT_FILE_NAME_MAX_LENGTH } from '@/config/midtrans-statement';
import { statementCopy } from '@/lib/copy/midtrans-statement';
import {
  STATEMENT_AMOUNT,
  STATEMENT_MAX_PAYLOAD_BYTES,
  STATEMENT_MAX_ROWS,
  STATEMENT_ORDER_ID,
  STATEMENT_STATUS,
  isKnownStatus,
  statementPayloadBytes,
} from '@/lib/midtrans/statement-csv';
import { totpCodeField } from '@/lib/validations/auth';

// The Midtrans statement import (Task P4.7.05), shared by the form and src/server/actions/finance-statement.ts. The
// browser reads the CSV with parseMidtransStatement and sends only its rows; the action checks their shape here and
// import_midtrans_statement checks it again. A statement is what Midtrans says, so nothing in it is applied: a row
// that disagrees with the payments only becomes a reconciliation issue. Review of PR #99: a status Midtrans' map does
// not know is refused (L2) and the rows stay under STATEMENT_MAX_PAYLOAD_BYTES (L3).

// A file name is shown back to the superadmin as text; control characters and path separators are dropped.
const FILE_NAME_UNSAFE = /[\p{Cc}/\x5c]/gu;

const statementRowSchema = z
  .object({
    orderId: z.string().regex(STATEMENT_ORDER_ID),
    status: z
      .string()
      .regex(STATEMENT_STATUS)
      .refine(isKnownStatus, statementCopy.problems.unknown_status),
    grossAmount: z.string().regex(STATEMENT_AMOUNT),
  })
  .strict();

// Info: the first and last day of the statement's transactions, when the file says.
const periodSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .strict()
  .refine((period) => period.from <= period.to, statementCopy.invalid);

const statementFields = {
  fileName: z
    .string()
    .transform((name) => name.replace(FILE_NAME_UNSAFE, '').trim())
    .pipe(z.string().min(1, statementCopy.fileRequired).max(STATEMENT_FILE_NAME_MAX_LENGTH)),
  rows: z
    .array(statementRowSchema)
    .min(1, statementCopy.fileRequired)
    .max(STATEMENT_MAX_ROWS)
    .refine(
      (rows) => new Set(rows.map((row) => row.orderId)).size === rows.length,
      statementCopy.problems.duplicates,
    )
    .refine(
      (rows) => statementPayloadBytes(rows) <= STATEMENT_MAX_PAYLOAD_BYTES,
      statementCopy.problems.too_large,
    ),
  period: periodSchema.nullable().default(null),
};

export const importStatementSchema = z.object(statementFields).strict();
export const importStatementFormSchema = z
  .object({ ...statementFields, code: totpCodeField })
  .strict();

export type ImportStatementInput = z.input<typeof importStatementSchema>;
export type ImportStatementValues = z.output<typeof importStatementSchema>;
export type ImportStatementFormValues = z.input<typeof importStatementFormSchema>;
