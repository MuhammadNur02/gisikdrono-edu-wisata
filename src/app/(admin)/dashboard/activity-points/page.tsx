import type { Metadata } from 'next';

import { ActivityPointBoard } from '@/components/admin/cms/activity-point-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { ACTIVITY_POINT_TYPE } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { contentStatusFacet, listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  archiveActivityPointAction,
  createActivityPointAction,
  removeActivityPointAction,
  updateActivityPointAction,
} from '@/server/actions/activity-points';
import { effectiveRw, ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listActivityPointsForStaff } from '@/server/services/activity-point-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.points;
const lists = contentListsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ACTIONS = {
  create: createActivityPointAction,
  update: updateActivityPointAction,
  archive: archiveActivityPointAction,
  remove: removeActivityPointAction,
};

// `?category=` names the point type: the list query has one single-select facet.
const TYPE_FACET: ListFacet = {
  param: 'category',
  title: lists.facets.type,
  options: DB_ENUMS.activity_point_type.map((type) => ({
    value: type,
    label: ACTIVITY_POINT_TYPE[type].label,
  })),
};

// Task P2.9.06 and P4.3.03, docs/PRD.md FR-ADMIN-14: one page of activity points from
// `?q=&sort=&page=&status=&category=&rw=`. The list follows effectiveRw; a new point belongs to the RW admin's own RW
// or the RW the superadmin's RwSwitcher points at (a point always belongs to an RW).
export default async function ActivityPointsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits, scope] = await Promise.all([
    effectiveRw(ctx, query.rw),
    listRwUnitsForStaff(),
    readRwScope(),
  ]);
  const newOwner = ownerOfNewContent(ctx, scope) ?? null;
  const result = await listActivityPointsForStaff(query, rw);
  const facets = listFacets(isSuperadmin, {
    status: contentStatusFacet(lists.facets.status),
    others: [TYPE_FACET],
    rw: rwFacet(lists.facets.rw, rwUnits),
  });

  return (
    <ActivityPointBoard
      rows={result.rows}
      total={result.total}
      facets={facets}
      notice={<OwnerNotice owner={newOwner} isSuperadmin={isSuperadmin} rwOnly />}
      showRw={isSuperadmin}
      newRwId={newOwner}
      pagePaths={Object.fromEntries(rwUnits.map((unit) => [unit.id, unit.path]))}
      actions={ACTIONS}
    />
  );
}
