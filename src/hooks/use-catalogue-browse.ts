'use client';

import { useEffect, useMemo, useState } from 'react';

import { useUrlFilters } from '@/hooks/use-url-filters';
import { SORT_PARAM, type BrowseGroup, type BrowseSort } from '@/lib/utils/catalogue-browse';
import type { CatalogueFilters } from '@/lib/utils/catalogue-filters';

// DESIGN-SPEC §4 (Produk, Search): the list follows the typing 200 ms after the last key.
const SEARCH_DEBOUNCE_MS = 200;

export interface CatalogueBrowseState {
  filters: CatalogueFilters;
  // The `?urut=` value; NULL is the list's default sort.
  sortValue: string | null;
  query: string;
  // The query the list filters by, behind the field by the debounce.
  appliedQuery: string;
  // True after the visitor's first change: the result list animates only from then on, never on load (LCP).
  hasChanged: boolean;
  setFilter: (param: string, value: string | null) => void;
  clearAll: () => void;
  setSort: (value: string | null) => void;
  setQuery: (query: string) => void;
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value]);
  return debounced;
}

function useUrlGroups(groups: readonly BrowseGroup[], sorts: readonly BrowseSort[]) {
  return useMemo(
    () => [
      ...groups.map((group) => ({
        param: group.param,
        values: group.options.map((option) => option.value),
      })),
      { param: SORT_PARAM, values: sorts.slice(1).map((sort) => sort.value) },
    ],
    [groups, sorts],
  );
}

// The filters and the sort live in the address (docs/PRD.md FR-PUB-11/13), so a filtered list can be shared; the
// search stays in the field, as a visitor's typing is not a link.
export function useCatalogueBrowse(
  groups: readonly BrowseGroup[],
  sorts: readonly BrowseSort[],
): CatalogueBrowseState {
  const [urlFilters, setUrlFilters] = useUrlFilters(useUrlGroups(groups, sorts));
  const [query, setQueryState] = useState('');
  const [hasChanged, setHasChanged] = useState(false);
  const appliedQuery = useDebounced(query);
  const { [SORT_PARAM]: sortValue = null, ...filters } = urlFilters;
  const change = (patch: CatalogueFilters) => {
    setHasChanged(true);
    setUrlFilters(patch);
  };
  return {
    filters,
    sortValue,
    query,
    appliedQuery,
    hasChanged,
    setFilter: (param, value) => {
      change({ [param]: value });
    },
    clearAll: () => {
      setQueryState('');
      change(Object.fromEntries(groups.map((group) => [group.param, null])));
    },
    setSort: (value) => {
      change({ [SORT_PARAM]: value === sorts[0]?.value ? null : value });
    },
    setQuery: (next) => {
      setHasChanged(true);
      setQueryState(next);
    },
  };
}
