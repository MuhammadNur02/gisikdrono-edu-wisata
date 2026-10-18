import type { ReactNode } from 'react';

import type { CatalogueFacets } from '@/lib/utils/catalogue-filters';

// The card grid of docs/StyleGuide.md §4.2, shared by the package and product grids.
export const CARD_GRID_CLASSES = {
  listClassName: 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  itemClassName: 'flex',
};

export interface CatalogueEntry {
  key: string;
  facets: CatalogueFacets;
  // Rendered on the server; the filter only decides whether it shows.
  card: ReactNode;
}

export interface CatalogueListProps {
  entries: readonly CatalogueEntry[];
  listClassName: string;
  itemClassName?: string;
}

// The list markup both the server fallback and the filter island render, so the two never differ.
export function CatalogueList({ entries, listClassName, itemClassName }: CatalogueListProps) {
  return (
    <ul className={listClassName}>
      {entries.map((entry) => (
        <li key={entry.key} className={itemClassName}>
          {entry.card}
        </li>
      ))}
    </ul>
  );
}
