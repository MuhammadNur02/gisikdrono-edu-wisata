'use client';

import { useQueryStates } from 'nuqs';
import { useTransition } from 'react';

import { listQueryParsers, type ListQuery } from '@/lib/utils/list-query';

export type ListQueryPatch = Partial<{ [Key in keyof ListQuery]: ListQuery[Key] | null }>;

export interface ListQueryState {
  query: ListQuery;
  // Writes the change to the URL and asks the server for the page again; a change of filters or search goes back
  // to the first page.
  update: (patch: ListQueryPatch) => void;
  reset: () => void;
  isPending: boolean;
}

const FILTER_KEYS = ['q', 'status', 'rw', 'category', 'date', 'per'] as const;

// docs/StyleGuide.md §6.4: the list's URL state, `?q=&sort=&page=&per=&status=&rw=`, as nuqs keeps it. Every write
// is a server round trip (shallow: false), since the rows are server-rendered; isPending dims the table meanwhile.
export function useListQuery(): ListQueryState {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useQueryStates(listQueryParsers, {
    shallow: false,
    startTransition,
  });
  const update = (patch: ListQueryPatch) => {
    const resetsPage = FILTER_KEYS.some((key) => key in patch);
    void setQuery(resetsPage ? { ...patch, page: null } : patch);
  };
  const reset = () => {
    void setQuery(null);
  };
  return { query, update, reset, isPending };
}
