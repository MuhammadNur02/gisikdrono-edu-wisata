import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';

import { ScheduleDialog } from '@/components/admin/cms/schedule-dialog';
import { ScheduleTable } from '@/components/admin/cms/schedule-table';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import {
  createScheduleAction,
  removeScheduleAction,
  updateScheduleAction,
} from '@/server/actions/schedules';
import { canManageSchedules, readRwScope, scheduleRwFor } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listScheduleRwIds } from '@/server/services/rw-unit-service';
import { listSchedulePackages, listSchedulesForStaff } from '@/server/services/schedule-service';

const text = copy.cms.schedules;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-13: the admin of an RW that runs a performance schedule (rw_units.schedule_enabled)
// and the superadmin. Any other RW admin has no menu item for it, and opening the address directly says so instead of
// showing anything.
// Opened by an RW admin whose RW runs no schedule, or by the superadmin while several RWs run one and the RwSwitcher
// points at none of them.
function NoScheduleNotice({ message }: { message: string }) {
  return (
    <>
      <DashboardPageHeader title={text.title} />
      <FormAlert tone="info">{message}</FormAlert>
    </>
  );
}

export default async function SchedulesPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const scheduleRwIds = await listScheduleRwIds();
  if (!canManageSchedules(ctx, scheduleRwIds)) return <NoScheduleNotice message={text.onlyRw08} />;
  const rwId = scheduleRwFor(ctx, await readRwScope(), scheduleRwIds);
  if (rwId === undefined) return <NoScheduleNotice message={copy.cms.chooseRw} />;
  const [schedules, packages] = await Promise.all([
    listSchedulesForStaff(rwId),
    listSchedulePackages(rwId),
  ]);
  const addButton = (
    <ScheduleDialog rwId={rwId} schedule={null} packages={packages} action={createScheduleAction} />
  );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={addButton} />
      {schedules.length === 0 ? (
        <EmptyState icon={CalendarDays} title={text.empty} description={text.emptyHint} />
      ) : (
        <ScheduleTable
          rwId={rwId}
          schedules={schedules}
          packages={packages}
          updateAction={updateScheduleAction}
          removeAction={removeScheduleAction}
        />
      )}
    </>
  );
}
