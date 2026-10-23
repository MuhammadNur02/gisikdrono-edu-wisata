'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Header,
  type RowSelectionState,
  type SortingState,
  type Table as TableInstance,
  type VisibilityState,
} from '@tanstack/react-table';
import { SearchX } from 'lucide-react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useState, type ReactNode } from 'react';

import { BulkActions, type BulkAction } from '@/components/admin/data-table/bulk-actions';
import { CardList } from '@/components/admin/data-table/card-list';
import { Pagination } from '@/components/admin/data-table/pagination';
import { Toolbar } from '@/components/admin/data-table/toolbar';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useListQuery, type ListQueryState } from '@/hooks/use-list-query';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { hasActiveFilters, parseSort, serializeSort } from '@/lib/utils/list-query';
import type { ListFacet, ListRow } from '@/types/data-table';

const text = copy.dashboard.table;
const SELECT_COLUMN_ID = 'select';

export interface DataTableProps<TData extends ListRow> {
  // Defined in a 'use client' module of the entity (its cells are functions, which a page cannot hand over).
  columns: ColumnDef<TData>[];
  rows: TData[];
  // How many rows match in all; the page holds one page of them.
  total: number;
  // `artikel`, `paket wisata`: the caption and the empty states name it.
  noun: string;
  facets?: readonly ListFacet[];
  searchPlaceholder?: string;
  toolbarActions?: ReactNode;
  // What the page shows when nothing exists yet (docs/StyleGuide.md §6.9); the filter-empty state is the table's own.
  emptyState: ReactNode;
  // Offered when rows can be selected; the bar shows at most three.
  bulkActions?: readonly BulkAction[];
}

function selectColumn<TData extends ListRow>(): ColumnDef<TData> {
  return {
    id: SELECT_COLUMN_ID,
    header: ({ table }) => (
      <Checkbox
        aria-label={text.selectAll}
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(checked) => {
          table.toggleAllPageRowsSelected(checked === true);
        }}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={text.selectRow}
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => {
          row.toggleSelected(checked === true);
        }}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { card: 'hidden' },
  };
}

function ariaSortOf<TData>(header: Header<TData, unknown>) {
  const sorted = header.column.getIsSorted();
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return header.column.getCanSort() ? 'none' : undefined;
}

function alignClass<TData>(header: Header<TData, unknown>): string | undefined {
  return header.column.columnDef.meta?.align === 'right' ? 'text-right tabular-nums' : undefined;
}

function HeaderRows<TData>({ table }: { table: TableInstance<TData> }) {
  return table.getHeaderGroups().map((headerGroup) => (
    <TableRow key={headerGroup.id} className="hover:bg-transparent">
      {headerGroup.headers.map((header) => (
        <TableHead
          key={header.id}
          aria-sort={ariaSortOf(header)}
          className={cn('h-12 px-4 text-body-sm', alignClass(header))}
        >
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
        </TableHead>
      ))}
    </TableRow>
  ));
}

function BodyRows<TData>({ table }: { table: TableInstance<TData> }) {
  return table.getRowModel().rows.map((row) => (
    <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={cn(
            'h-12 px-4 text-body-sm',
            cell.column.columnDef.meta?.align === 'right' && 'text-right tabular-nums',
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  ));
}

// docs/StyleGuide.md §6.4: sticky header, 48 px rows, hover tint, no zebra; nothing animates (§7.3).
function DesktopTable<TData>({ table, caption }: { table: TableInstance<TData>; caption: string }) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border md:block">
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
          <HeaderRows table={table} />
        </TableHeader>
        <TableBody>
          <BodyRows table={table} />
        </TableBody>
      </Table>
    </div>
  );
}

function FilterEmpty({ onReset }: { onReset: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title={text.filterEmpty}
      description={text.filterEmptyHint}
      action={
        <Button type="button" variant="outline" onClick={onReset}>
          {text.reset}
        </Button>
      }
    />
  );
}

// The sort the URL names, as TanStack keeps it; only a column of this table counts.
function useSorting<TData extends ListRow>(list: ListQueryState, columns: ColumnDef<TData>[]) {
  const sortable = columns.flatMap((column) => (column.id === undefined ? [] : [column.id]));
  const order = parseSort(list.query.sort, sortable);
  const sorting: SortingState =
    order === null ? [] : [{ id: order.column, desc: !order.ascending }];
  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const [next] = typeof updater === 'function' ? updater(sorting) : updater;
    const sort = serializeSort(
      next === undefined ? null : { column: next.id, ascending: !next.desc },
    );
    list.update({ sort: sort === '' ? null : sort });
  };
  return { sorting, onSortingChange };
}

// TanStack holds the column state; sorting, paging and filtering are the server's (manual*).
function useDataTable<TData extends ListRow>(
  list: ListQueryState,
  columns: ColumnDef<TData>[],
  rows: TData[],
  selectable: boolean,
) {
  const { sorting, onSortingChange } = useSorting(list, columns);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const table = useReactTable({
    data: rows,
    columns: selectable ? [selectColumn<TData>(), ...columns] : columns,
    state: { sorting, rowSelection, columnVisibility },
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    enableRowSelection: selectable,
    getRowId: (row) => row.id,
    onSortingChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const clearSelection = () => {
    setRowSelection({});
  };
  return { table, selectedIds, clearSelection };
}

function DataTableBody<TData extends ListRow>(props: DataTableProps<TData>) {
  const { columns, rows, total, noun, facets = [], bulkActions, emptyState } = props;
  const list = useListQuery();
  const selectable = bulkActions !== undefined && bulkActions.length > 0;
  const { table, selectedIds, clearSelection } = useDataTable(list, columns, rows, selectable);
  const isEmpty = rows.length === 0;
  if (isEmpty && !hasActiveFilters(list.query)) return emptyState;
  return (
    <div className={cn('space-y-4', list.isPending && 'opacity-60')} aria-busy={list.isPending}>
      <Toolbar
        list={list}
        table={table}
        facets={facets}
        searchPlaceholder={props.searchPlaceholder ?? text.searchPlaceholder}
        actions={props.toolbarActions}
      />
      {isEmpty ? (
        <FilterEmpty onReset={list.reset} />
      ) : (
        <>
          <DesktopTable table={table} caption={text.caption(noun, total)} />
          <CardList table={table} selectable={selectable} />
          <Pagination
            page={list.query.page}
            per={list.query.per}
            total={total}
            update={list.update}
          />
        </>
      )}
      {selectable ? (
        <BulkActions selectedIds={selectedIds} actions={bulkActions} onClear={clearSelection} />
      ) : null}
    </div>
  );
}

// docs/StyleGuide.md §6.4 (Task P4.3.01): rows rendered on the server from the URL's `?q=&sort=&page=&status=&rw=`,
// TanStack Table for column state, cards below md, a sr-only caption, and sortable headers that announce their state.
export function DataTable<TData extends ListRow>(props: DataTableProps<TData>) {
  return (
    <NuqsAdapter>
      <DataTableBody {...props} />
    </NuqsAdapter>
  );
}
