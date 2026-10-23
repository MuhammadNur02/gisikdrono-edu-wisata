'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import type { CatalogueFilters } from '@/lib/utils/catalogue-filters';

export interface UrlFilterGroup {
  // The URL parameter: `rw`, `type`, `category`, `rating`.
  param: string;
  // The values the parameter may carry; any other reads as none, as nuqs' parseAsStringLiteral did.
  values: readonly string[];
}

type SetUrlFilters = (patch: CatalogueFilters) => void;

// The filters of a public catalogue, held in the URL (docs/PRD.md FR-PUB-11/13/17) with no dependency: the App
// Router keeps useSearchParams in step with history.replaceState, so a change rewrites the address, re-renders
// the island and asks the server for nothing. nuqs stays a dashboard dependency (CLAUDE.md §2.1), off the
// public first-load budget (Task P5.6.01). The caller sits under a Suspense boundary, as useSearchParams asks.
export function useUrlFilters(groups: readonly UrlFilterGroup[]): [CatalogueFilters, SetUrlFilters] {
  const searchParams = useSearchParams();
  const filters: CatalogueFilters = Object.fromEntries(
    groups.map((group) => {
      const value = searchParams.get(group.param);
      return [group.param, value !== null && group.values.includes(value) ? value : null];
    }),
  );
  const setFilters = useCallback<SetUrlFilters>(
    (patch) => {
      const next = new URLSearchParams(searchParams);
      for (const [param, value] of Object.entries(patch)) {
        if (value === null) next.delete(param);
        else next.set(param, value);
      }
      const query = next.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    },
    [searchParams],
  );
  return [filters, setFilters];
}
