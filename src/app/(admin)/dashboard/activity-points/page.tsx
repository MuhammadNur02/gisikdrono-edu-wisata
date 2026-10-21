import { MapPin } from 'lucide-react';
import type { Metadata } from 'next';

import { ActivityPointDialog } from '@/components/admin/cms/activity-point-dialog';
import { ActivityPointTable } from '@/components/admin/cms/activity-point-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { copy } from '@/lib/copy/id';
import {
  createActivityPointAction,
  removeActivityPointAction,
  updateActivityPointAction,
} from '@/server/actions/activity-points';
import { listedOwners, ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listActivityPointsForStaff } from '@/server/services/activity-point-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';

const text = copy.cms.points;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-14.
export default async function ActivityPointsPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const [scope, rwUnits] = await Promise.all([readRwScope(), listRwUnitsForStaff()]);
  const newOwner = ownerOfNewContent(ctx, scope);
  const rwIds = listedOwners(
    ctx,
    scope,
    rwUnits.map((unit) => unit.id),
  ).filter((owner) => owner !== null);
  const points = await listActivityPointsForStaff(rwIds);
  const pagePathOf = (rwId: number) => rwUnits.find((unit) => unit.id === rwId)?.path ?? '';
  const isSuperadmin = ctx.role === 'superadmin';
  const addButton =
    newOwner === null || newOwner === undefined ? null : (
      <ActivityPointDialog
        rwId={newOwner}
        pagePath={pagePathOf(newOwner)}
        point={null}
        action={createActivityPointAction}
      />
    );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={addButton} />
      <OwnerNotice owner={newOwner ?? null} isSuperadmin={isSuperadmin} rwOnly />
      {points.length === 0 ? (
        <EmptyState icon={MapPin} title={text.empty} description={text.emptyHint} />
      ) : (
        <ActivityPointTable
          points={points}
          rwUnits={rwUnits}
          showRw={isSuperadmin}
          updateAction={updateActivityPointAction}
          removeAction={removeActivityPointAction}
        />
      )}
    </>
  );
}
