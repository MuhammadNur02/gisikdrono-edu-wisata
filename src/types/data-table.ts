import type { RowData } from '@tanstack/react-table';

// docs/StyleGuide.md §6.4 (Task P4.3.01): what a column tells the DataTable beyond its cell: how the phone card list
// shows it, whether its header sorts, and how its numbers align.
export type CardRole = 'title' | 'badge' | 'meta' | 'actions' | 'hidden';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TanStack's own signature carries both parameters.
  interface ColumnMeta<TData extends RowData, TValue> {
    // The header text, reused by the column-visibility menu and the card list's meta lines.
    label?: string;
    card?: CardRole;
    // Money and counts sit right-aligned in tabular figures.
    align?: 'right';
  }
}

// What a list page gets from its service: one page of rows and how many there are in all.
export interface ListResult<TRow> {
  rows: TRow[];
  total: number;
}

export interface FacetOption {
  value: string;
  label: string;
}

// A faceted filter of the toolbar, bound to one URL parameter of listQueryParsers.
export interface ListFacet {
  param: 'status' | 'rw' | 'category';
  title: string;
  options: readonly FacetOption[];
}

// A row every DataTable can select and act on.
export interface ListRow {
  id: string;
}
