// What one Midtrans statement import did (public.import_midtrans_statement, Task P4.7.05). A statement imported before
// answers with its earlier run (alreadyImported); issuesAlreadyOpen counts the differences an open issue already holds.
export interface StatementImportSummary {
  runId: string;
  rowsChecked: number;
  issuesFound: number;
  issuesAlreadyOpen: number;
  alreadyImported: boolean;
}
