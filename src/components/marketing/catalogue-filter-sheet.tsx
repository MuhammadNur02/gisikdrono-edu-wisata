'use client';

import { Check } from 'lucide-react';

import { GroupChips } from '@/components/marketing/catalogue-chips';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { CatalogueBrowseState } from '@/hooks/use-catalogue-browse';
import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';
import type { BrowseGroup, BrowseSort } from '@/lib/utils/catalogue-browse';
import { cn } from '@/lib/utils/cn';

export interface CatalogueFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The groups the phone bar leaves out (the type), and the sort.
  groups: readonly BrowseGroup[];
  sorts: readonly BrowseSort[];
  state: CatalogueBrowseState;
  count: number;
  noun: string;
}

function SortOptions({ sorts, state }: Pick<CatalogueFilterSheetProps, 'sorts' | 'state'>) {
  const current = state.sortValue ?? sorts[0]?.value;
  return (
    <div className="space-y-2">
      <p className="text-caption font-semibold text-muted-foreground">
        {catalogueUiCopy.sortLabel}
      </p>
      <div role="radiogroup" aria-label={catalogueUiCopy.sortLabel} className="space-y-1">
        {sorts.map((sort) => (
          <button
            key={sort.value}
            type="button"
            role="radio"
            aria-checked={sort.value === current}
            onClick={() => {
              state.setSort(sort.value);
            }}
            className={cn(
              'flex h-12 w-full items-center justify-between rounded-md px-3 text-left text-body transition-colors hover:bg-muted',
              sort.value === current && 'font-semibold',
            )}
          >
            {sort.label}
            {sort.value === current ? (
              <Check aria-hidden className="size-4.5 text-primary-ink" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SheetGroup({ group, state }: { group: BrowseGroup; state: CatalogueBrowseState }) {
  return (
    <div role="group" aria-label={group.label} className="space-y-3">
      <p className="text-caption font-semibold text-muted-foreground">{group.label}</p>
      <div className="flex flex-wrap gap-2">
        <GroupChips
          group={group}
          filters={state.filters}
          isEmpty={false}
          onChange={state.setFilter}
        />
      </div>
    </div>
  );
}

// The phone's filter sheet (DESIGN-SPEC §3.4): from the bottom on the sheet spring, the type chips and the sort, and a
// button that shows the result. Loaded only when the visitor opens it (next/dynamic in catalogue-browser.tsx).
export function CatalogueFilterSheet({
  open,
  onOpenChange,
  groups,
  sorts,
  state,
  count,
  noun,
}: CatalogueFilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="sheet-bottom gap-5 overflow-y-auto rounded-t-2xl px-5 pt-3"
      >
        <span aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-border-strong" />
        <SheetHeader className="p-0">
          <SheetTitle>{catalogueUiCopy.filterSheetTitle}</SheetTitle>
          <SheetDescription>{catalogueUiCopy.filterSheetDescription}</SheetDescription>
        </SheetHeader>
        {groups.map((group) => (
          <SheetGroup key={group.param} group={group} state={state} />
        ))}
        {sorts.length > 1 ? <SortOptions sorts={sorts} state={state} /> : null}
        <SheetClose asChild>
          <Button size="lg" className="w-full">
            {catalogueUiCopy.filterShowResults(count, noun)}
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
