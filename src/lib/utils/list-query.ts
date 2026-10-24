import {
  createLoader,
  parseAsArrayOf,
  parseAsInteger,
  parseAsNumberLiteral,
  parseAsString,
} from 'nuqs/server';

import { DEFAULT_PAGE_SIZE, LIST_PAGE_SIZES, SEARCH_MAX_LENGTH } from '@/config/dashboard';
import { escapeLike } from '@/lib/utils/escape-like';

// docs/StyleGuide.md §6.4 (Task P4.3.01): the URL state of every dashboard list, `?q=&sort=&page=&per=&status=&rw=`,
// typed once by nuqs for the page (loadListQuery) and the table (useListQuery). The parsers live in nuqs/server,
// which carries no 'use client', so both sides read the same definition.

const FIRST_PAGE = 1;
const SORT_SEPARATOR = '.';
const SORT_DESCENDING = 'desc';

export const listQueryParsers = {
  q: parseAsString.withDefault(''),
  // `<column>.asc` or `<column>.desc`; the service keeps only a column it allows.
  sort: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(FIRST_PAGE),
  per: parseAsNumberLiteral(LIST_PAGE_SIZES).withDefault(DEFAULT_PAGE_SIZE),
  status: parseAsArrayOf(parseAsString).withDefault([]),
  // One RW, or every RW the staff member may see.
  rw: parseAsInteger,
  // One category (a product category, a gallery category), where a list has one.
  category: parseAsString,
  // One calendar day (`2026-10-24`), where a list is read day by day (/dashboard/attendance); the service checks it.
  date: parseAsString,
};

export const loadListQuery = createLoader(listQueryParsers);

export type ListQuery = Awaited<ReturnType<typeof loadListQuery>>;

export interface SortOrder {
  column: string;
  ascending: boolean;
}

// `name.desc` → { column: 'name', ascending: false }; a column outside `allowed` or an unknown direction is ignored,
// so the URL never chooses the order by.
export function parseSort(sort: string, allowed: readonly string[]): SortOrder | null {
  const [column, direction] = sort.split(SORT_SEPARATOR);
  if (!column || !allowed.includes(column)) return null;
  if (direction !== undefined && direction !== 'asc' && direction !== SORT_DESCENDING) return null;
  return { column, ascending: direction !== SORT_DESCENDING };
}

export function serializeSort(order: SortOrder | null): string {
  if (order === null) return '';
  return `${order.column}${SORT_SEPARATOR}${order.ascending ? 'asc' : SORT_DESCENDING}`;
}

// The ilike pattern of a search box, or null when there is nothing to search for. Escaped, so `%` and `_` match
// themselves (CLAUDE.md §6.3); capped, so a pasted essay never reaches the database.
export function searchPattern(q: string): string | null {
  const trimmed = q.trim().slice(0, SEARCH_MAX_LENGTH);
  return trimmed === '' ? null : `%${escapeLike(trimmed)}%`;
}

// The inclusive row range PostgREST's .range() takes for a page; a page below the first reads as the first.
export function pageRange(page: number, per: number): { from: number; to: number } {
  const safePage = Math.max(FIRST_PAGE, Math.floor(page));
  const from = (safePage - FIRST_PAGE) * per;
  return { from, to: from + per - 1 };
}

export function pageCountOf(total: number, per: number): number {
  return Math.max(FIRST_PAGE, Math.ceil(total / per));
}

// The values of a multi-select facet that the enum actually has; anything else in the URL is dropped.
export function allowedValues<T extends string>(
  values: readonly string[],
  allowed: readonly T[],
): T[] {
  return allowed.filter((candidate) => values.includes(candidate));
}

// Whether the staff member has narrowed the list, which decides the filter-empty state (docs/StyleGuide.md §6.9).
export function hasActiveFilters(query: ListQuery): boolean {
  return (
    query.q.trim() !== '' ||
    query.status.length > 0 ||
    query.rw !== null ||
    query.category !== null ||
    query.date !== null
  );
}
