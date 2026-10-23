'use client';

import { flexRender, type Cell, type Row, type Table } from '@tanstack/react-table';

import { Checkbox } from '@/components/ui/checkbox';
import { copy } from '@/lib/copy/id';
import type { CardRole } from '@/types/data-table';

const text = copy.dashboard.table;
const SELECT_COLUMN_ID = 'select';

function roleOf<TData>(cell: Cell<TData, unknown>): CardRole | undefined {
  return cell.column.columnDef.meta?.card;
}

function cellsByRole<TData>(row: Row<TData>) {
  const cells = row.getVisibleCells().filter((cell) => cell.column.id !== SELECT_COLUMN_ID);
  const title = cells.find((cell) => roleOf(cell) === 'title') ?? cells[0];
  return {
    title,
    badge: cells.find((cell) => roleOf(cell) === 'badge'),
    actions: cells.find((cell) => roleOf(cell) === 'actions'),
    // Everything else, except what the card hides or already shows.
    meta: cells.filter(
      (cell) => cell !== title && (roleOf(cell) === 'meta' || roleOf(cell) === undefined),
    ),
  };
}

function RowCard<TData>({ row, selectable }: { row: Row<TData>; selectable: boolean }) {
  const { title, badge, actions, meta } = cellsByRole(row);
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      {selectable ? (
        // A 44 px hit area around the 16 px box (docs/StyleGuide.md §9.1; review of PR #31, item 5).
        <label className="-mt-3 -ml-3 flex size-11 shrink-0 items-center justify-center">
          <Checkbox
            aria-label={text.selectRow}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => {
              row.toggleSelected(checked === true);
            }}
          />
        </label>
      ) : null}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-body font-medium">
            {title ? flexRender(title.column.columnDef.cell, title.getContext()) : null}
          </div>
          {actions ? (
            <div className="-mt-2 -mr-2 shrink-0">
              {flexRender(actions.column.columnDef.cell, actions.getContext())}
            </div>
          ) : null}
        </div>
        {badge ? <div>{flexRender(badge.column.columnDef.cell, badge.getContext())}</div> : null}
        <MetaLines cells={meta} />
      </div>
    </li>
  );
}

function MetaLines<TData>({ cells }: { cells: Cell<TData, unknown>[] }) {
  if (cells.length === 0) return null;
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-body-sm">
      {cells.map((cell) => (
        <div key={cell.id} className="contents">
          <dt className="col-span-1 truncate text-muted-foreground">
            {cell.column.columnDef.meta?.label ?? cell.column.id}
          </dt>
          <dd className="col-span-2 min-w-0 truncate">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// docs/StyleGuide.md §6.4: below md the rows become cards built from the same column definitions: the title cell,
// the badge, the other columns as labelled lines, and the row menu.
export function CardList<TData>({
  table,
  selectable,
}: {
  table: Table<TData>;
  selectable: boolean;
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {table.getRowModel().rows.map((row) => (
        <RowCard key={row.id} row={row} selectable={selectable} />
      ))}
    </ul>
  );
}
