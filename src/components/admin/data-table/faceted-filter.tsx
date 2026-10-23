'use client';

import { PlusCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { copy } from '@/lib/copy/id';
import type { ListFacet } from '@/types/data-table';

const text = copy.dashboard.table;
// Past this many chosen values the button shows a count instead of the labels.
const MAX_SHOWN_VALUES = 2;

// cmdk loads with the first popover, not with the page (review of PR #31, item 8).
const FacetedFilterList = dynamic(
  () =>
    import('@/components/admin/data-table/faceted-filter-list').then(
      (module) => module.FacetedFilterList,
    ),
  { ssr: false },
);

export interface FacetedFilterProps {
  facet: ListFacet;
  selected: readonly string[];
  // A multi-select facet (status) keeps several values; a single one (RW, category) keeps the last pick.
  multiple: boolean;
  onChange: (values: string[]) => void;
}

function SelectedSummary({ facet, selected }: Pick<FacetedFilterProps, 'facet' | 'selected'>) {
  if (selected.length === 0) return null;
  const chosen = facet.options.filter((option) => selected.includes(option.value));
  return (
    <span className="flex items-center gap-1 border-l border-border pl-2">
      {chosen.length > MAX_SHOWN_VALUES ? (
        <Badge variant="secondary">{text.selectedCount(chosen.length)}</Badge>
      ) : (
        chosen.map((option) => (
          <Badge key={option.value} variant="secondary">
            {option.label}
          </Badge>
        ))
      )}
    </span>
  );
}

function toggled(selected: readonly string[], value: string, multiple: boolean): string[] {
  if (selected.includes(value)) return selected.filter((item) => item !== value);
  return multiple ? [...selected, value] : [value];
}

// docs/StyleGuide.md §6.4: a toolbar filter as a popover list with check marks, the chosen values on the button.
export function FacetedFilter({ facet, selected, multiple, onChange }: FacetedFilterProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="border-dashed">
          <PlusCircle aria-hidden />
          {facet.title}
          <SelectedSummary facet={facet} selected={selected} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <FacetedFilterList
          facet={facet}
          selected={selected}
          onToggle={(value) => {
            onChange(toggled(selected, value, multiple));
          }}
          onClear={() => {
            onChange([]);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
