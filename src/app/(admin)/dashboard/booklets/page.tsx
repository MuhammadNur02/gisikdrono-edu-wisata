import type { Metadata } from 'next';

import { BookletBoard } from '@/components/admin/cms/booklet-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { contentStatusFacet, listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  archiveBookletAction,
  createBookletAction,
  removeBookletAction,
  updateBookletAction,
} from '@/server/actions/booklets';
import { effectiveRw, ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listBookletsForStaff } from '@/server/services/booklet-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.booklets;
const lists = contentListsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// `?category=` names the booklet kind: the list query has one single-select facet.
const KIND_FACET: ListFacet = {
  param: 'category',
  title: lists.facets.kind,
  options: DB_ENUMS.booklet_kind.map((kind) => ({ value: kind, label: BOOKLET_KIND_LABELS[kind] })),
};

// Task P2.9.06 and P4.3.03, docs/PRD.md FR-ADMIN-12: one page of booklets from `?q=&sort=&page=&status=&category=&rw=`.
// The list follows effectiveRw; a new booklet belongs to the owner the RwSwitcher points at (the kelurahan under Semua).
export default async function BookletsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits, scope] = await Promise.all([
    effectiveRw(ctx, query.rw),
    listRwUnitsForStaff(),
    readRwScope(),
  ]);
  const owner = ownerOfNewContent(ctx, scope);
  if (owner === undefined) return null;
  const result = await listBookletsForStaff(query, rw);
  const facets = listFacets(isSuperadmin, {
    status: contentStatusFacet(lists.facets.status),
    others: [KIND_FACET],
    rw: rwFacet(lists.facets.rw, rwUnits),
  });

  return (
    <BookletBoard
      rows={result.rows}
      total={result.total}
      facets={facets}
      notice={<OwnerNotice owner={owner} isSuperadmin={isSuperadmin} />}
      owner={owner}
      isSuperadmin={isSuperadmin}
      createAction={createBookletAction}
      updateAction={updateBookletAction}
      archiveAction={archiveBookletAction}
      removeAction={isSuperadmin ? removeBookletAction : null}
    />
  );
}
