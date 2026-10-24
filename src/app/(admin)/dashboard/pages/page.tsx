import type { Metadata } from 'next';

import { RwPageBoard } from '@/components/admin/cms/rw-page-table';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import { updateRwPageAction } from '@/server/actions/pages';
import { effectiveRw } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listRwPagesForStaff } from '@/server/services/rw-page-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';

const text = cmsCopy.pages;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Task P2.9.06 and P4.3.03, docs/PRD.md FR-ADMIN-15: the RW admin edits their own RW's page; the superadmin every RW's,
// narrowed by `?rw=` (effectiveRw), each in a sheet.
export default async function RwPagesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const [rw, rwUnits] = await Promise.all([effectiveRw(ctx, query.rw), listRwUnitsForStaff()]);
  const result = await listRwPagesForStaff(query, rw);
  const isSuperadmin = ctx.role === 'superadmin';
  const facets = listFacets(isSuperadmin, {
    rw: rwFacet(contentListsCopy.facets.rw, rwUnits),
  });

  return (
    <RwPageBoard
      rows={result.rows}
      total={result.total}
      facets={facets}
      isSuperadmin={isSuperadmin}
      updateAction={updateRwPageAction}
    />
  );
}
