'use client';

import { MessageSquareQuote, PackageSearch, RotateCcw, ShoppingBag } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import {
  CatalogueFilterBar,
  type CatalogueSearchCopy,
} from '@/components/marketing/catalogue-filter-bar';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { Button } from '@/components/ui/button';
import { rwAccentClasses } from '@/config/rw';
import { useCatalogueBrowse, type CatalogueBrowseState } from '@/hooks/use-catalogue-browse';
import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';
import {
  browseEntries,
  chosenOptions,
  fillChoiceTemplate,
  sortFor,
  type BrowseFacts,
  type BrowseGroup,
  type BrowseSort,
} from '@/lib/utils/catalogue-browse';
import { cn } from '@/lib/utils/cn';

const CatalogueFilterSheet = dynamic(
  () =>
    import('@/components/marketing/catalogue-filter-sheet').then(
      (module) => module.CatalogueFilterSheet,
    ),
  { ssr: false },
);

const EMPTY_ICONS = {
  package: PackageSearch,
  product: ShoppingBag,
  review: MessageSquareQuote,
} as const;

export interface CatalogueBrowserEntry extends BrowseFacts {
  // Rendered on the server; the browser only decides whether and where it shows.
  card: ReactNode;
}

export interface CatalogueBrowserEmpty {
  icon: keyof typeof EMPTY_ICONS;
  title: string;
  description: string;
  // A sentence naming the visitor's choices, before the description: `{rw} belum punya paket khusus {type}.`
  choiceTemplate?: string;
  askLabel: string;
  askMessage: string;
}

export interface CatalogueBrowserProps {
  entries: readonly CatalogueBrowserEntry[];
  groups: readonly BrowseGroup[];
  layout: 'rows' | 'inline';
  // `paket`, `produk`: the word after the count.
  noun: string;
  sorts?: readonly BrowseSort[];
  search?: CatalogueSearchCopy;
  empty: CatalogueBrowserEmpty;
  listClassName: string;
  itemClassName?: string;
  // A last grid item after the cards, such as the products' add-on panel; not shown with an empty result.
  trailing?: ReactNode;
}

function emptyDescription(props: CatalogueBrowserProps, state: CatalogueBrowseState): string {
  const choice = fillChoiceTemplate(props.empty.choiceTemplate, props.groups, state.filters);
  return choice ? `${choice} ${props.empty.description}` : props.empty.description;
}

// The empty answer takes the colour of the RW the visitor chose, the site's brick otherwise (DESIGN-SPEC §3.14).
function EmptyResult({
  props,
  state,
}: {
  props: CatalogueBrowserProps;
  state: CatalogueBrowseState;
}) {
  const chosenRw = chosenOptions(props.groups, state.filters).find((option) => option.accentKey);
  return (
    <CatalogueState
      role="status"
      icon={EMPTY_ICONS[props.empty.icon]}
      tone="rw"
      title={props.empty.title}
      description={emptyDescription(props, state)}
      className={chosenRw?.accentKey ? rwAccentClasses(chosenRw.accentKey).scope : 'rw-scope-combo'}
      actions={
        <>
          <Button variant="outline" size="lg" onClick={state.clearAll}>
            {catalogueUiCopy.clearAll}
            <RotateCcw aria-hidden />
          </Button>
          <WhatsAppLinkButton
            size="lg"
            label={props.empty.askLabel}
            message={props.empty.askMessage}
          />
        </>
      }
    />
  );
}

function ResultList({
  props,
  shown,
  state,
}: {
  props: CatalogueBrowserProps;
  shown: readonly CatalogueBrowserEntry[];
  state: CatalogueBrowseState;
}) {
  const signature = JSON.stringify([state.filters, state.sortValue, state.appliedQuery]);
  return (
    <ul
      key={signature}
      className={cn(props.listClassName, state.hasChanged && 'results-enter reveal-stagger')}
    >
      {shown.map((entry) => (
        <li key={entry.key} className={props.itemClassName}>
          {entry.card}
        </li>
      ))}
      {props.trailing ? <li className={props.itemClassName}>{props.trailing}</li> : null}
    </ul>
  );
}

// The phone's line under the bar: the count with the chosen sheet filters, and the sort, which opens the sheet.
function PhoneResultLine({
  props,
  state,
  count,
  onOpenSheet,
}: {
  props: CatalogueBrowserProps;
  state: CatalogueBrowseState;
  count: number;
  onOpenSheet: () => void;
}) {
  const chosen = chosenOptions(props.groups.slice(1), state.filters).map((option) => option.label);
  const sort = sortFor(props.sorts ?? [], state.sortValue);
  return (
    <div className="mb-5 flex items-center justify-between gap-4 md:hidden">
      <p aria-live="polite" className="text-body-sm font-medium">
        {[catalogueUiCopy.count(count, props.noun), ...chosen].join(' · ')}
      </p>
      {sort && props.layout === 'rows' ? (
        <button
          type="button"
          onClick={onOpenSheet}
          className="min-h-11 text-body-sm font-medium text-ink-2"
        >
          {sort.label}
        </button>
      ) : null}
    </div>
  );
}

interface ResultsProps {
  props: CatalogueBrowserProps;
  state: CatalogueBrowseState;
  shown: readonly CatalogueBrowserEntry[];
  onOpenSheet: () => void;
}

function Results({ props, state, shown, onOpenSheet }: ResultsProps) {
  return (
    <Container className="pt-6 pb-16 md:pt-12 md:pb-16">
      <PhoneResultLine props={props} state={state} count={shown.length} onOpenSheet={onOpenSheet} />
      {shown.length === 0 ? (
        <EmptyResult props={props} state={state} />
      ) : (
        <ResultList props={props} shown={shown} state={state} />
      )}
    </Container>
  );
}

export function CatalogueBrowserView({
  props,
  state,
}: {
  props: CatalogueBrowserProps;
  state: CatalogueBrowseState;
}) {
  const [isSheetOpen, setSheetOpen] = useState(false);
  const sorts = props.sorts ?? [];
  const sort = sortFor(sorts, state.sortValue);
  const shown = browseEntries(props.entries, state.filters, state.appliedQuery, sort);
  const openSheet = () => {
    setSheetOpen(true);
  };
  return (
    <>
      <CatalogueFilterBar
        {...props}
        sorts={sorts}
        state={state}
        count={shown.length}
        isEmpty={shown.length === 0}
        onOpenSheet={openSheet}
      />
      <Results props={props} state={state} shown={shown} onOpenSheet={openSheet} />
      {isSheetOpen ? (
        <CatalogueFilterSheet
          open
          onOpenChange={setSheetOpen}
          groups={props.groups.slice(1)}
          sorts={sorts}
          state={state}
          count={shown.length}
          noun={props.noun}
        />
      ) : null}
    </>
  );
}

// docs/PRD.md FR-PUB-11/13, DESIGN-SPEC §3.4/§3.6: the public catalogue island. Shallow: the filters, the sort and the
// search run on the list already on the page, so a change never asks the server again. It reads the address, so the
// page renders it under a Suspense boundary whose fallback is CatalogueBrowserStatic.
export function CatalogueBrowser(props: CatalogueBrowserProps) {
  const state = useCatalogueBrowse(props.groups, props.sorts ?? []);
  return <CatalogueBrowserView props={props} state={state} />;
}

const STATIC_STATE: CatalogueBrowseState = {
  filters: {},
  sortValue: null,
  query: '',
  appliedQuery: '',
  hasChanged: false,
  setFilter: () => undefined,
  clearAll: () => undefined,
  setSort: () => undefined,
  setQuery: () => undefined,
};

// What the page prerenders and shows until the island reads the address: the same bar and the full list, so the
// two never differ and nothing moves when the island takes over.
export function CatalogueBrowserStatic(props: CatalogueBrowserProps) {
  return <CatalogueBrowserView props={props} state={STATIC_STATE} />;
}
