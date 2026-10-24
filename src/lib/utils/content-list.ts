import type { RwId } from '@/config/rw';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import {
  allowedValues,
  pageRange,
  parseSort,
  searchPattern,
  type ListQuery,
  type SortOrder,
} from '@/lib/utils/list-query';

// What a content list service asks PostgREST for, read once from the URL's query (Task P4.3.03, docs/StyleGuide.md
// §6.4): the escaped search pattern, the content statuses the enum has, an order by an allowed column only, the RW
// effectiveRw settled, and the page's row range. Pure, so every list reads the URL the same way.
export interface ContentListPlan {
  pattern: string | null;
  statuses: EnumValue<'content_status'>[];
  order: SortOrder | null;
  rw: RwId | null;
  from: number;
  to: number;
}

export function planContentList(
  query: ListQuery,
  rw: RwId | null,
  sort: { columns: readonly string[]; fallback: string },
): ContentListPlan {
  const { from, to } = pageRange(query.page, query.per);
  return {
    pattern: searchPattern(query.q),
    statuses: allowedValues(query.status, DB_ENUMS.content_status),
    order: parseSort(query.sort, sort.columns) ?? parseSort(sort.fallback, sort.columns),
    rw,
    from,
    to,
  };
}

// One value of a single-select facet (`?category=`) that the enum has, or null.
export function allowedValue<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  if (value === null) return null;
  return allowed.find((candidate) => candidate === value) ?? null;
}
