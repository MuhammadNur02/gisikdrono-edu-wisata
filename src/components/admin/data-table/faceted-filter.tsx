'use client';

import { Check, PlusCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { ListFacet } from '@/types/data-table';

const text = copy.dashboard.table;
// Past this many chosen values the button shows a count instead of the labels.
const MAX_SHOWN_VALUES = 2;

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

function ClearGroup({ onClear }: { onClear: () => void }) {
  return (
    <>
      <CommandSeparator />
      <CommandGroup>
        <CommandItem onSelect={onClear} className="justify-center">
          {text.clearFilter}
        </CommandItem>
      </CommandGroup>
    </>
  );
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
                    onChange(toggled(selected, option.value, multiple));
                  }}
                />
              ))}
            </CommandGroup>
            {selected.length > 0 ? (
              <ClearGroup
                onClear={() => {
                  onChange([]);
                }}
              />
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
