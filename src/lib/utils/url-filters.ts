import type { CatalogueFilters } from '@/lib/utils/catalogue-filters';

// The URL side of the public catalogue filters (docs/PRD.md FR-PUB-11/13/17), pure so the hook that applies it
// (src/hooks/use-url-filters.ts) holds no logic of its own (review of PR #32).

export interface UrlFilterGroup {
  // The URL parameter: `rw`, `type`, `category`, `rating`.
  param: string;
  // The values the parameter may carry; any other reads as none, as nuqs' parseAsStringLiteral did.
  values: readonly string[];
}

// One entry per group: its value when the address carries one the group allows, otherwise NULL (`Semua`).
export function readUrlFilters(
  params: URLSearchParams,
  groups: readonly UrlFilterGroup[],
): CatalogueFilters {
  return Object.fromEntries(
    groups.map((group) => {
      const value = params.get(group.param);
      return [group.param, value !== null && group.values.includes(value) ? value : null];
    }),
  );
}

// The address after `patch`: a NULL clears its parameter, a value sets it, every other parameter and the hash
// stay as they were, and an empty query leaves no `?` behind.
export function nextFilterUrl(
  params: URLSearchParams,
  patch: CatalogueFilters,
  pathname: string,
  hash: string,
): string {
  const next = new URLSearchParams(params);
  for (const [param, value] of Object.entries(patch)) {
    if (value === null) next.delete(param);
    else next.set(param, value);
  }
  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}
