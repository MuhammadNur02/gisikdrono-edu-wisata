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
import { canManageSchedules } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listSchedulePackages, listSchedulesForStaff } from '@/server/services/schedule-service';

const text = copy.cms.schedules;

export const metadata: Metadata = { title: text.title };

// Task P2.9.06, docs/PRD.md FR-ADMIN-13: RW 08's admin and the superadmin. The RW 05 admin has no menu item for it, and
// opening the address directly says so instead of showing anything.
export default async function SchedulesPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (!canManageSchedules(ctx)) {
    return (
      <>
        <DashboardPageHeader title={text.title} />
        <FormAlert tone="info">{text.onlyRw08}</FormAlert>
      </>
    );
  }
  const [schedules, packages] = await Promise.all([
    listSchedulesForStaff(),
    listSchedulePackages(),
  ]);
  const addButton = (
    <ScheduleDialog schedule={null} packages={packages} action={createScheduleAction} />
  );

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={addButton} />
      {schedules.length === 0 ? (
        <EmptyState icon={CalendarDays} title={text.empty} description={text.emptyHint} />
      ) : (
        <ScheduleTable
          schedules={schedules}
          packages={packages}
          updateAction={updateScheduleAction}
          removeAction={removeScheduleAction}
        />
      )}
    </>
  );
}
