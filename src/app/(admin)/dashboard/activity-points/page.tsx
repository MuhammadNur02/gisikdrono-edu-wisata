import { MapPin } from 'lucide-react';
import type { Metadata } from 'next';

import { ActivityPointDialog } from '@/components/admin/cms/activity-point-dialog';
import { ActivityPointTable } from '@/components/admin/cms/activity-point-table';
import { OwnerNotice } from '@/components/admin/cms/owner-notice';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { isRwId, type RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import {
  createActivityPointAction,
  removeActivityPointAction,
  updateActivityPointAction,
} from '@/server/actions/activity-points';
import { listedOwners, ownerOfNewContent, readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listActivityPointsForStaff } from '@/server/services/activity-point-service';

const text = copy.cms.points;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-14.
export default async function ActivityPointsPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const scope = await readRwScope();
  const newOwner = ownerOfNewContent(ctx, scope);
  const rwIds = listedOwners(ctx, scope).filter(
    (owner): owner is RwId => owner !== null && isRwId(owner),
  );
  const points = await listActivityPointsForStaff(rwIds);
  const isSuperadmin = ctx.role === 'superadmin';
  const addButton =
    newOwner === null || newOwner === undefined ? null : (
      <ActivityPointDialog rwId={newOwner} point={null} action={createActivityPointAction} />
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
          showRw={isSuperadmin}
          updateAction={updateActivityPointAction}
          removeAction={removeActivityPointAction}
        />
      )}
    </>
  );
}
