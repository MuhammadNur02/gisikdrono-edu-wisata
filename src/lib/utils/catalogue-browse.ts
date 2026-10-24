import type { RwAccent } from '@/config/rw';
import {
  matchesFilters,
  type CatalogueFacets,
  type CatalogueFilters,
} from '@/lib/utils/catalogue-filters';

// The pure side of the catalogue browser island (src/components/marketing/catalogue-browser.tsx, DESIGN-SPEC §3.4,
// §3.6): which entries a filter, a search and a sort leave, and in which order. The server describes every entry;
// the browser only compares, so the cards never ship as client code.

export interface BrowseOption {
  value: string;
  label: string;
  // The words an empty-state sentence uses for this choice, written as the sentence needs them: `Kampung Budaya & Seni`
  // for `RW 13 · Kampung Budaya & Seni`, `institusi` for `Institusi`; the label when left out.
  name?: string;
  // An RW option leads with a dot in the RW's accent (DESIGN-SPEC §2.3); the combination option with one in the brick.
  accentKey?: RwAccent;
  isCombo?: boolean;
}

export interface BrowseGroup {
  // The URL parameter: `rw`, `type`, `category`.
  param: string;
  label: string;
  // The group's own `Semua` chip in the two-row bar (`Semua kampung`).
  allLabel: string;
  options: readonly BrowseOption[];
}

export interface BrowseSort {
  // The `?urut=` value; the first sort of a list is its default and never written to the address.
  value: string;
  label: string;
  // The entry's sortValues key it orders by.
  key: string;
  direction: 'asc' | 'desc';
}

export interface BrowseFacts {
  key: string;
  facets: CatalogueFacets;
  // Numbers to order by, such as the price in rupiah or the duration in minutes.
  sortValues?: Readonly<Record<string, number>>;
  // What a search matches against, such as the name and the vendor.
  searchText?: string;
}

export const SORT_PARAM = 'urut';
// `{rw}`, `{type}`: a group's parameter in an empty-state sentence.
const PLACEHOLDER = /\{(\w+)\}/g;

// Lower case, without diacritics, single spaced: `Kompos  1 KG` and `kompos 1 kg` read the same.
export function normaliseSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Every word of the query appears somewhere in the entry's text; an empty query matches everything.
export function matchesSearch(searchText: string | undefined, query: string): boolean {
  const words = normaliseSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normaliseSearch(searchText ?? '');
  return words.every((word) => haystack.includes(word));
}

export function sortFor(sorts: readonly BrowseSort[], value: string | null): BrowseSort | null {
  return sorts.find((sort) => sort.value === value) ?? sorts[0] ?? null;
}

// A stable sort: entries without the value, or with the same one, keep the server's order.
export function sortEntries<Entry extends BrowseFacts>(
  entries: readonly Entry[],
  sort: BrowseSort | null,
): Entry[] {
  if (sort === null) return [...entries];
  const sign = sort.direction === 'asc' ? 1 : -1;
  const valueOf = (entry: Entry) => entry.sortValues?.[sort.key] ?? Number.MAX_SAFE_INTEGER;
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => sign * (valueOf(a.entry) - valueOf(b.entry)) || a.index - b.index)
    .map(({ entry }) => entry);
}

export function browseEntries<Entry extends BrowseFacts>(
  entries: readonly Entry[],
  filters: CatalogueFilters,
  query: string,
  sort: BrowseSort | null,
): Entry[] {
  const shown = entries.filter(
    (entry) => matchesFilters(entry.facets, filters) && matchesSearch(entry.searchText, query),
  );
  return sortEntries(shown, sort);
}

// The chosen option of each group, in the groups' order.
export function chosenOptions(
  groups: readonly BrowseGroup[],
  filters: CatalogueFilters,
): BrowseOption[] {
  return groups.flatMap((group) => {
    const chosen = group.options.find((option) => option.value === filters[group.param]);
    return chosen ? [chosen] : [];
  });
}

// `{rw} belum punya paket khusus {type}.` with every placeholder filled from the chosen options, or NULL when the
// template is missing or a placeholder has no choice behind it.
export function fillChoiceTemplate(
  template: string | undefined,
  groups: readonly BrowseGroup[],
  filters: CatalogueFilters,
): string | null {
  if (!template) return null;
  const chosenFor = (param: string) =>
    groups
      .find((group) => group.param === param)
      ?.options.find((option) => option.value === filters[param]);
  const params = [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
  if (!params.every((param) => chosenFor(param))) return null;
  return template.replace(PLACEHOLDER, (_, param: string) => {
    const chosen = chosenFor(param);
    return chosen?.name ?? chosen?.label ?? '';
  });
}
