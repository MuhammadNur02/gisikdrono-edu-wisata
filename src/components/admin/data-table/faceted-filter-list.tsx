'use client';

import { Check } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { ListFacet } from '@/types/data-table';

const text = copy.dashboard.table;

export interface FacetedFilterListProps {
  facet: ListFacet;
  selected: readonly string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

function FacetOptionItem({
  label,
  isSelected,
  onToggle,
}: {
  label: string;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <CommandItem value={label} aria-selected={isSelected} onSelect={onToggle}>
      <span
        aria-hidden
        className={cn(
          'flex size-4 items-center justify-center rounded-sm border border-primary',
          isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50',
        )}
      >
        {isSelected ? <Check className="size-3" /> : null}
      </span>
      {label}
    </CommandItem>
  );
}

// The cmdk list inside a facet's popover, loaded on the first open so cmdk stays out of every list page's first
// load (review of PR #31, item 8).
export function FacetedFilterList({ facet, selected, onToggle, onClear }: FacetedFilterListProps) {
  return (
    <Command>
      <CommandInput placeholder={text.filter(facet.title)} />
      <CommandList>
        <CommandEmpty>{text.noOptions}</CommandEmpty>
        <CommandGroup>
          {facet.options.map((option) => (
            <FacetOptionItem
              key={option.value}
              label={option.label}
              isSelected={selected.includes(option.value)}
              onToggle={() => {
                onToggle(option.value);
              }}
            />
          ))}
        </CommandGroup>
        {selected.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={onClear} className="justify-center">
                {text.clearFilter}
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  );
}
