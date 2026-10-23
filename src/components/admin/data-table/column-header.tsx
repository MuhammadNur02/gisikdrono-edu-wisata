'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

const text = copy.dashboard.table;

export interface ColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

// The next step of the sort cycle, named for screen readers: none → asc → desc → none.
function nextSortLabel(sorted: false | 'asc' | 'desc'): string {
  if (sorted === false) return text.sortAscending;
  return sorted === 'asc' ? text.sortDescending : text.sortNone;
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ArrowUp aria-hidden className="size-3.5" />;
  if (sorted === 'desc') return <ArrowDown aria-hidden className="size-3.5" />;
  return <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />;
}

// docs/StyleGuide.md §6.4: a sortable header is a button that cycles asc → desc → none; the table sets aria-sort on
// the cell, and the button says what the next press does. Sorting is instant, never animated (§7.3).
export function ColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: ColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>;
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => {
        column.toggleSorting();
      }}
      className={cn(
        '-ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-left font-medium transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {title}
      <SortIcon sorted={sorted} />
      <span className="sr-only">
        {sorted === 'asc' ? text.sortedAscending : sorted === 'desc' ? text.sortedDescending : ''}
        {' · '}
        {nextSortLabel(sorted)}
      </span>
    </button>
  );
}
