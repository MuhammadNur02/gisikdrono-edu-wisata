// PostgREST answers at most max_rows rows per request (100, supabase/config.toml), so a total summed from one
// response would quietly leave out the rest. A KPI that sums rows reads them page by page against the exact count
// and is either complete or not shown at all (review of PR #45, H1). Pure apart from the fetch it is given.

// One request's worth, not above max_rows.
export const ROW_PAGE_SIZE = 100;
// Beyond this many rows a figure is "not available" until the aggregates of Task P4.2.01 serve it in Postgres.
export const ROW_CEILING = 2_000;

export interface RowPage<Row> {
  rows: Row[];
  // The exact count of the whole result (`count: 'exact'`); null when the server did not say.
  count: number | null;
}

export type CollectedRows<Row> = { complete: true; rows: Row[] } | { complete: false };

export interface CollectOptions {
  pageSize?: number;
  ceiling?: number;
}

const INCOMPLETE = { complete: false } as const;

// Reads pages [0, size), [size, 2·size), … until every counted row is in. Rows that appear, vanish or a count that
// moves between pages make the result incomplete rather than wrong.
export async function collectAllRows<Row>(
  fetchPage: (from: number, to: number) => Promise<RowPage<Row>>,
  { pageSize = ROW_PAGE_SIZE, ceiling = ROW_CEILING }: CollectOptions = {},
): Promise<CollectedRows<Row>> {
  const first = await fetchPage(0, pageSize - 1);
  const total = first.count;
  if (total === null || total > ceiling) return INCOMPLETE;
  const rows = [...first.rows];
  while (rows.length < total) {
    const page = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (page.rows.length === 0 || page.count !== total) return INCOMPLETE;
    rows.push(...page.rows);
  }
  return rows.length === total ? { complete: true, rows } : INCOMPLETE;
}
