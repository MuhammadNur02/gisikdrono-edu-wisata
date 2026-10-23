import {
  createTable,
  getCoreRowModel,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';

function ignoreStateChange(): void {
  // The table below only answers which columns sort; it never holds state.
}

// The ids of the columns a header may sort by, as TanStack itself decides (review of PR #31, item 4): every leaf
// column, grouped ones included, that has an accessor (an accessorKey or an accessorFn) and does not opt out with
// enableSorting: false, under the id TanStack gives it (`pic.name` → `pic_name`). A table built from the same
// definitions answers through getAllLeafColumns() and getCanSort(), so the sort the URL names is checked against
// exactly what the headers offer before it reaches TanStack and the server.
export function sortableColumnIds<TData extends RowData>(columns: ColumnDef<TData>[]): string[] {
  const table = createTable<TData>({
    data: [],
    columns,
    state: {},
    onStateChange: ignoreStateChange,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
  });
  return table
    .getAllLeafColumns()
    .filter((column) => column.getCanSort())
    .map((column) => column.id);
}
