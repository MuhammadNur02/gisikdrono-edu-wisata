'use client';

import type { Table } from '@tanstack/react-table';
import { Search, Settings2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { FacetedFilter } from '@/components/admin/data-table/faceted-filter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SEARCH_DEBOUNCE_MS, SEARCH_MAX_LENGTH } from '@/config/dashboard';
import type { ListQueryState } from '@/hooks/use-list-query';
import { copy } from '@/lib/copy/id';
import { hasActiveFilters } from '@/lib/utils/list-query';
import type { ListFacet } from '@/types/data-table';

const text = copy.dashboard.table;

export interface ToolbarProps<TData> {
  list: ListQueryState;
  table: Table<TData>;
  facets: readonly ListFacet[];
  searchPlaceholder: string;
  // The page's own buttons at the end of the toolbar, such as `Ekspor`.
  actions?: ReactNode;
}

// Keystrokes reach the URL (and the server) SEARCH_DEBOUNCE_MS after the last one; a change from outside (the
// reset button, the back button) shows at once.
function useDebouncedSearch(list: ListQueryState) {
  const [typed, setTyped] = useState(list.query.q);
  const [lastQuery, setLastQuery] = useState(list.query.q);
  if (list.query.q !== lastQuery) {
    setLastQuery(list.query.q);
    setTyped(list.query.q);
  }
  useEffect(() => {
    if (typed === list.query.q) return;
    const timer = window.setTimeout(() => {
      list.update({ q: typed.trim() === '' ? null : typed });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed, list]);
  return [typed, setTyped] as const;
}

function SearchBox({ list, placeholder }: { list: ListQueryState; placeholder: string }) {
  const [typed, setTyped] = useDebouncedSearch(list);
  return (
    <div className="relative w-full sm:w-64">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={text.search}
        placeholder={placeholder}
        value={typed}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        className="h-10 pl-9"
      />
    </div>
  );
}

function ColumnVisibility<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllLeafColumns().filter((column) => column.getCanHide());
  if (columns.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="hidden md:inline-flex">
          <Settings2 aria-hidden />
          {text.columns}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{text.columnsLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(checked) => {
              column.toggleVisibility(checked);
            }}
          >
            {column.columnDef.meta?.label ?? column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The URL keeps one value for `rw` and `category` and a list for `status`.
function facetValues(list: ListQueryState, facet: ListFacet): string[] {
  if (facet.param === 'status') return list.query.status;
  const value = list.query[facet.param];
  return value === null ? [] : [String(value)];
}

function writeFacet(list: ListQueryState, facet: ListFacet, values: string[]): void {
  if (facet.param === 'status') {
    list.update({ status: values.length === 0 ? null : values });
    return;
  }
  const [value] = values;
  if (facet.param === 'rw') list.update({ rw: value === undefined ? null : Number(value) });
  else list.update({ category: value ?? null });
}

// docs/StyleGuide.md §6.4: search, the faceted filters, `Reset` once something is set, the column menu and the page's
// own actions. Filtering is instant and never animated (§7.3).
export function Toolbar<TData>({
  list,
  table,
  facets,
  searchPlaceholder,
  actions,
}: ToolbarProps<TData>) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchBox list={list} placeholder={searchPlaceholder} />
      <div className="flex flex-wrap items-center gap-2">
        {facets.map((facet) => (
          <FacetedFilter
            key={facet.param}
            facet={facet}
            selected={facetValues(list, facet)}
            multiple={facet.param === 'status'}
            onChange={(values) => {
              writeFacet(list, facet, values);
            }}
          />
        ))}
        {hasActiveFilters(list.query) ? (
          <Button type="button" variant="ghost" size="sm" onClick={list.reset}>
            {text.reset}
            <X aria-hidden />
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:ml-auto">
        <ColumnVisibility table={table} />
        {actions}
      </div>
    </div>
  );
}
