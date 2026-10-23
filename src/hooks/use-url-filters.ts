'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import type { CatalogueFilters } from '@/lib/utils/catalogue-filters';
import { nextFilterUrl, readUrlFilters, type UrlFilterGroup } from '@/lib/utils/url-filters';

type SetUrlFilters = (patch: CatalogueFilters) => void;

// The filters of a public catalogue, held in the URL (docs/PRD.md FR-PUB-11/13/17) with no dependency: the App
// Router keeps useSearchParams in step with history.replaceState, so a change rewrites the address, re-renders
// the island and asks the server for nothing. nuqs stays a dashboard dependency (CLAUDE.md §2.1), off the
// public first-load budget (Task P5.6.01). The caller sits under a Suspense boundary, as useSearchParams asks;
// the reading and the rewriting are src/lib/utils/url-filters.ts, tested there.
export function useUrlFilters(
  groups: readonly UrlFilterGroup[],
): [CatalogueFilters, SetUrlFilters] {
  const searchParams = useSearchParams();
  const filters = readUrlFilters(searchParams, groups);
  const setFilters = useCallback<SetUrlFilters>(
    (patch) => {
      const { pathname, hash } = window.location;
      window.history.replaceState(null, '', nextFilterUrl(searchParams, patch, pathname, hash));
    },
    [searchParams],
  );
  return [filters, setFilters];
}
