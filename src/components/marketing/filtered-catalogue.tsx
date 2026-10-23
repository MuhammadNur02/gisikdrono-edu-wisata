'use client';

import { useMemo } from 'react';

import { CatalogueList, type CatalogueListProps } from '@/components/marketing/catalogue-list';
import { FilterChips, type FilterOption } from '@/components/marketing/filter-chips';
import { FilterEmpty } from '@/components/marketing/filter-empty';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { matchesFilters } from '@/lib/utils/catalogue-filters';

export interface CatalogueFilterGroup {
  // The URL parameter: `rw`, `type`, `category`, `rating`.
  param: string;
  label: string;
  options: readonly FilterOption<string>[];
}

export interface FilteredCatalogueProps extends CatalogueListProps {
  groups: readonly CatalogueFilterGroup[];
  emptyMessage: string;
}

function useCatalogueFilters(groups: readonly CatalogueFilterGroup[]) {
  const urlGroups = useMemo(
    () =>
      groups.map((group) => ({
        param: group.param,
        values: group.options.map((option) => option.value),
      })),
    [groups],
  );
  return useUrlFilters(urlGroups);
}

// The one client island of the public catalogues (docs/PRD.md FR-PUB-11/13/17). Shallow: the filter runs on the
// list already on the page, so a change never asks the server again.
export function FilteredCatalogue({
  groups,
  emptyMessage,
  entries,
  ...list
}: FilteredCatalogueProps) {
  const [filters, setFilters] = useCatalogueFilters(groups);
  const shown = entries.filter((entry) => matchesFilters(entry.facets, filters));
  const clearAll = () => {
    setFilters(Object.fromEntries(groups.map((group) => [group.param, null])));
  };
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-10">
        {groups.map((group) => (
          <FilterChips
            key={group.param}
            label={group.label}
            options={group.options}
            value={filters[group.param] ?? null}
            onChange={(value) => {
              setFilters({ [group.param]: value });
            }}
          />
        ))}
      </div>
      {shown.length > 0 ? (
        <CatalogueList entries={shown} {...list} />
      ) : (
        <FilterEmpty message={emptyMessage} onClear={clearAll} />
      )}
    </div>
  );
}
