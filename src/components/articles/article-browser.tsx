'use client';

import { RotateCcw, Search, SearchX } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { BrowseChip } from '@/components/marketing/catalogue-chips';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { Button } from '@/components/ui/button';
import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';
import { matchesSearch, type BrowseOption } from '@/lib/utils/catalogue-browse';
import { nextFilterUrl } from '@/lib/utils/url-filters';

// The article list's two islands, the controls in the page head and the list under it, share their state through the
// address (`?category=`, `?q=`), as the App Router keeps useSearchParams in step with history.replaceState. Both run
// under Suspense; their fallbacks show every article.
export const CATEGORY_PARAM = 'category';
export const QUERY_PARAM = 'q';
// DESIGN-SPEC §4 (Artikel list, Search): the list follows the typing 200 ms after the last key.
const SEARCH_DEBOUNCE_MS = 200;

function replaceParams(patch: Record<string, string | null>) {
  const { pathname, hash } = window.location;
  const current = new URLSearchParams(window.location.search);
  window.history.replaceState(null, '', nextFilterUrl(current, patch, pathname, hash));
}

function useArticleParams(categories: readonly BrowseOption[]) {
  const params = useSearchParams();
  const category = params.get(CATEGORY_PARAM);
  return {
    category: categories.some((option) => option.value === category) ? category : null,
    query: params.get(QUERY_PARAM) ?? '',
  };
}

export interface ArticleControlsProps {
  categories: readonly BrowseOption[];
  searchLabel: string;
  searchPlaceholder: string;
  categoryLabel: string;
}

function useDebouncedQueryWrite(initial: string) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      replaceParams({ [QUERY_PARAM]: value.trim() === '' ? null : value });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value]);
  return [value, setValue] as const;
}

interface ControlsViewProps extends ArticleControlsProps {
  category: string | null;
  value: string;
  onValue: (value: string) => void;
}

function SearchField({
  label,
  placeholder,
  value,
  onValue,
}: {
  label: string;
  placeholder: string;
  value: string;
  onValue: (value: string) => void;
}) {
  return (
    <div className="relative w-full">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onValue(event.target.value);
        }}
        className="h-12 w-full rounded-md border border-input bg-card pr-4 pl-11 text-body placeholder:text-muted-foreground focus-visible:border-ring"
      />
    </div>
  );
}

function CategoryChips({
  categories,
  category,
  label,
}: {
  categories: readonly BrowseOption[];
  category: string | null;
  label: string;
}) {
  const choose = (next: string | null) => {
    replaceParams({ [CATEGORY_PARAM]: next });
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2 lg:justify-end">
      <BrowseChip
        isPressed={category === null}
        label={catalogueUiCopy.filterAll}
        onClick={() => {
          choose(null);
        }}
      />
      {categories.map((option) => (
        <BrowseChip
          key={option.value}
          isPressed={category === option.value}
          label={option.label}
          onClick={() => {
            choose(category === option.value ? null : option.value);
          }}
        />
      ))}
    </div>
  );
}

function ControlsView(props: ControlsViewProps) {
  return (
    <div className="flex w-full flex-col gap-3 lg:w-85 lg:items-end">
      <SearchField
        label={props.searchLabel}
        placeholder={props.searchPlaceholder}
        value={props.value}
        onValue={props.onValue}
      />
      <CategoryChips
        categories={props.categories}
        category={props.category}
        label={props.categoryLabel}
      />
    </div>
  );
}

// The search (340 px) and the category chips beside the page head (DESIGN-SPEC §3.8). A search cleared from the empty
// state clears the field too.
export function ArticleControls(props: ArticleControlsProps) {
  const { category, query } = useArticleParams(props.categories);
  const [value, setValue] = useDebouncedQueryWrite(query);
  useEffect(() => {
    if (query === '') setValue('');
  }, [query, setValue]);
  return <ControlsView {...props} category={category} value={value} onValue={setValue} />;
}

// What the page prerenders until the island reads the address: the same controls, nothing chosen yet.
export function ArticleControlsStatic(props: ArticleControlsProps) {
  return <ControlsView {...props} category={null} value="" onValue={() => undefined} />;
}

export interface ArticleBrowserEntry {
  key: string;
  category: string;
  searchText: string;
  featured: ReactNode;
  row: ReactNode;
}

export interface ArticleResultsProps {
  entries: readonly ArticleBrowserEntry[];
  categories: readonly BrowseOption[];
  othersLabel: string;
  allShown: string;
  empty: { title: string; description: string };
}

// The newest match as the featured article, the rest as rows, then the end line (DESIGN-SPEC §3.8).
export function ArticleList({
  entries,
  othersLabel,
  allShown,
}: Omit<ArticleResultsProps, 'categories' | 'empty'>) {
  const [first, ...rest] = entries;
  if (!first) return null;
  return (
    <div className="space-y-12 md:space-y-16">
      {first.featured}
      {rest.length > 0 ? (
        <section aria-label={othersLabel} className="space-y-2">
          <h2 className="border-b border-border pb-3 text-meta-caps text-muted-foreground">
            {othersLabel}
          </h2>
          <ul className="divide-y divide-border border-b border-border">
            {rest.map((entry) => (
              <li key={entry.key}>{entry.row}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-center text-body-sm text-muted-foreground">{allShown}</p>
    </div>
  );
}

function NoArticleMatches({ empty }: Pick<ArticleResultsProps, 'empty'>) {
  return (
    <CatalogueState
      role="status"
      icon={SearchX}
      tone="rw"
      className="rw-scope-combo"
      title={empty.title}
      description={empty.description}
      actions={
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            replaceParams({ [CATEGORY_PARAM]: null, [QUERY_PARAM]: null });
          }}
        >
          {catalogueUiCopy.clearAll}
          <RotateCcw aria-hidden />
        </Button>
      }
    />
  );
}

export function ArticleResults({ entries, categories, empty, ...listCopy }: ArticleResultsProps) {
  const { category, query } = useArticleParams(categories);
  const key = `${category ?? ''}|${query}`;
  // The list crossfades after the visitor's change, never on load, so the featured cover paints at once (LCP).
  const firstKey = useRef(key);
  const shown = entries.filter(
    (entry) =>
      (category === null || entry.category === category) && matchesSearch(entry.searchText, query),
  );
  if (shown.length === 0) return <NoArticleMatches empty={empty} />;
  return (
    <div
      key={key}
      className={
        key === firstKey.current
          ? undefined
          : 'motion-safe:animate-in motion-safe:duration-160 motion-safe:fade-in'
      }
    >
      <ArticleList entries={shown} {...listCopy} />
    </div>
  );
}
