// What one Midtrans statement import did (public.import_midtrans_statement, Task P4.7.05).
export interface StatementImportSummary {
  runId: string;
  rowsChecked: number;
  issuesFound: number;
}
