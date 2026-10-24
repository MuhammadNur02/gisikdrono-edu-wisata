'use client';

import { ChevronsUpDown, Search, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { BrowseChip, ChipScroller, GroupChips } from '@/components/marketing/catalogue-chips';
import type { CatalogueBrowseState } from '@/hooks/use-catalogue-browse';
import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';
import type { BrowseGroup, BrowseSort } from '@/lib/utils/catalogue-browse';
import { cn } from '@/lib/utils/cn';

export interface CatalogueSearchCopy {
  label: string;
  placeholder: string;
}

export interface CatalogueFilterBarProps {
  groups: readonly BrowseGroup[];
  // `rows`: one labelled row per group (the package list); `inline`: one row of chips (the product list).
  layout: 'rows' | 'inline';
  noun: string;
  sorts: readonly BrowseSort[];
  search?: CatalogueSearchCopy;
  state: CatalogueBrowseState;
  count: number;
  isEmpty: boolean;
  onOpenSheet: () => void;
}

export function ResultCount({ count, noun }: { count: number; noun: string }) {
  return (
    <p aria-live="polite" className="text-body-sm font-medium whitespace-nowrap text-foreground">
      {catalogueUiCopy.count(count, noun)}
    </p>
  );
}

// A native select in the field's dress (40 px, the input edge): `Urutkan: Harga terendah`.
export function SortSelect({
  sorts,
  state,
}: {
  sorts: readonly BrowseSort[];
  state: CatalogueBrowseState;
}) {
  if (sorts.length <= 1) return null;
  return (
    <label className="relative inline-flex h-10 items-center gap-1 rounded-md border border-input bg-card pr-9 pl-3.5 text-label-sm font-medium focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
      <span>{catalogueUiCopy.sortLabel}:</span>
      <select
        value={state.sortValue ?? sorts[0]?.value}
        onChange={(event) => {
          state.setSort(event.target.value);
        }}
        className="appearance-none bg-transparent font-medium outline-none"
      >
        {sorts.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown
        aria-hidden
        className="pointer-events-none absolute right-3 size-4 text-ink-2"
      />
    </label>
  );
}

export function SearchField({
  search,
  state,
  className,
}: {
  search: CatalogueSearchCopy;
  state: CatalogueBrowseState;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        aria-label={search.label}
        placeholder={search.placeholder}
        value={state.query}
        onChange={(event) => {
          state.setQuery(event.target.value);
        }}
        className="h-11 w-full rounded-md border border-input bg-card pr-3.5 pl-10 text-body placeholder:text-muted-foreground focus-visible:border-ring md:h-10"
      />
    </div>
  );
}

// The filter button of the phone bar: the inverse pill with the number of filters set in its sheet (DESIGN-SPEC §3.4).
function SheetButton({ activeCount, onClick }: { activeCount: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 shrink-0 press-scale items-center gap-2 rounded-full bg-secondary px-4 text-body-sm font-medium text-secondary-foreground hover:bg-secondary-hover"
    >
      <SlidersHorizontal aria-hidden className="size-4" />
      {catalogueUiCopy.filterButton}
      {activeCount > 0 ? (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          <span className="sr-only">{catalogueUiCopy.activeFilters(activeCount)}</span>
          <span aria-hidden>{activeCount}</span>
        </span>
      ) : null}
    </button>
  );
}

// The phone row: the filter button (with the count of the sheet's filters), then the first group's chips.
function PhoneRow({ groups, state, isEmpty, onOpenSheet }: CatalogueFilterBarProps) {
  const [first, ...rest] = groups;
  const sheetCount = rest.filter((group) => state.filters[group.param]).length;
  return (
    <div className="flex items-center gap-2 md:hidden">
      <SheetButton activeCount={sheetCount} onClick={onOpenSheet} />
      {first ? (
        <ChipScroller label={first.label} bleed="end">
          <GroupChips
            group={first}
            filters={state.filters}
            isEmpty={isEmpty}
            onChange={state.setFilter}
          />
        </ChipScroller>
      ) : null}
    </div>
  );
}

// From md: one labelled row per group; the last row ends with the count and the sort.
function WideRows({ groups, state, isEmpty, count, noun, sorts }: CatalogueFilterBarProps) {
  return (
    <div className="space-y-3.5 max-md:hidden">
      {groups.map((group, index) => (
        <div key={group.param} className="flex items-center gap-4">
          <p className="w-32.5 shrink-0 text-caption font-semibold text-muted-foreground">
            {group.label}
          </p>
          <ChipScroller label={group.label}>
            <GroupChips
              group={group}
              filters={state.filters}
              isEmpty={isEmpty}
              onChange={state.setFilter}
            />
          </ChipScroller>
          {index === groups.length - 1 ? (
            <div className="ml-auto flex items-center gap-4">
              <ResultCount count={count} noun={noun} />
              <SortSelect sorts={sorts} state={state} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RowsLayout(props: CatalogueFilterBarProps) {
  return (
    <>
      <PhoneRow {...props} />
      <WideRows {...props} />
    </>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 self-center bg-border-strong" />;
}

function InlineLayout({ groups, state, isEmpty, count, noun, search }: CatalogueFilterBarProps) {
  const hasNoFilter = groups.every((group) => !state.filters[group.param]);
  const chips: ReactNode[] = groups.map((group, index) => (
    <span key={group.param} role="group" aria-label={group.label} className="contents">
      {index > 0 ? <Divider /> : null}
      <GroupChips
        group={group}
        filters={state.filters}
        isEmpty={isEmpty}
        onChange={state.setFilter}
        hasAllChip={false}
      />
    </span>
  ));
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
      <ChipScroller label={catalogueUiCopy.filterButton}>
        <BrowseChip
          isPressed={hasNoFilter}
          label={catalogueUiCopy.filterAll}
          onClick={state.clearAll}
        />
        {chips}
      </ChipScroller>
      <div className="flex items-center gap-4 max-md:order-first md:ml-auto">
        <span className="max-md:hidden">
          <ResultCount count={count} noun={noun} />
        </span>
        {search ? <SearchField search={search} state={state} className="w-full md:w-75" /> : null}
      </div>
    </div>
  );
}

// The sticky filter bar of DESIGN-SPEC §3.4 and §3.6: under the header, between two hairlines, on the paper at 95 %
// with a blur, so the cards pass softly beneath it.
export function CatalogueFilterBar(props: CatalogueFilterBarProps) {
  return (
    <div className="sticky top-(--header-h) z-20 border-y border-border bg-background/95 backdrop-blur-lg">
      <Container className="py-3 md:py-5">
        {props.layout === 'rows' ? <RowsLayout {...props} /> : <InlineLayout {...props} />}
      </Container>
    </div>
  );
}
