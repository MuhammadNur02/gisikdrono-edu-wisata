import type { ColumnDef, RowData } from '@tanstack/react-table';

// TanStack names a column by its id, or else by its accessorKey with the dots replaced (`pic.name` → `pic_name`),
// the same rule its column instances follow; a column that opts out of sorting is left out (review of PR #31, item
// 4). The sort the URL names is checked against this list before it reaches TanStack and the server.
export function columnIdOf<TData extends RowData>(column: ColumnDef<TData>): string | null {
  if (column.id !== undefined) return column.id;
  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    return column.accessorKey.replaceAll('.', '_');
  }
  return null;
}

export function sortableColumnIds<TData extends RowData>(
  columns: readonly ColumnDef<TData>[],
): string[] {
  return columns.flatMap((column) => {
    if (column.enableSorting === false) return [];
    const id = columnIdOf(column);
    return id === null ? [] : [id];
  });
}
