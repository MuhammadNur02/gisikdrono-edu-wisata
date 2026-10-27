// The Midtrans statement import of /dashboard/finance/reconciliation (Task P4.7.05, docs/Security.md REC-02).

export const STATEMENT_IMPORT_PATH = '/dashboard/finance/reconciliation';

// The browser reads at most this much of a chosen file; a statement for one month is far smaller.
export const STATEMENT_MAX_FILE_BYTES = 5_000_000;
// import_midtrans_statement keeps the first 200 characters of the file's name.
export const STATEMENT_FILE_NAME_MAX_LENGTH = 200;
// A refusal names at most this many record numbers, then says how many more there are.
export const STATEMENT_RECORDS_SHOWN = 10;
