import type { Metadata } from 'next';

import { ScheduleBoard } from '@/components/admin/cms/schedule-table';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { rwLabel } from '@/config/rw';
import { SCHEDULE_TYPE_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { contentStatusFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  archiveScheduleAction,
  createScheduleAction,
  removeScheduleAction,
  updateScheduleAction,
} from '@/server/actions/schedules';
import { canManageSchedules, readRwScope, scheduleRwFor } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listScheduleRwIds } from '@/server/services/rw-unit-service';
import { listSchedulePackages, listSchedulesForStaff } from '@/server/services/schedule-service';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.schedules;
const lists = contentListsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ACTIONS = {
  create: createScheduleAction,
  update: updateScheduleAction,
  archive: archiveScheduleAction,
  remove: removeScheduleAction,
};

// `?category=` names the schedule type: the list query has one single-select facet.
const FACETS: ListFacet[] = [
  contentStatusFacet(lists.facets.status),
  {
    param: 'category',
    title: lists.facets.type,
    options: DB_ENUMS.schedule_type.map((type) => ({
      value: type,
      label: SCHEDULE_TYPE_LABELS[type],
    })),
  },
];

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

// Task P2.9.06 and P4.3.03, docs/PRD.md FR-ADMIN-13: the admin of an RW that runs a performance schedule
// (rw_units.schedule_enabled) and the superadmin, one RW at a time, one page from `?q=&sort=&page=&status=&category=`.
// Any other RW admin has no menu item for it, and opening the address directly says so instead of showing anything.
export default async function SchedulesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const scheduleRwIds = await listScheduleRwIds();
  if (!canManageSchedules(ctx, scheduleRwIds)) {
    return <NoScheduleNotice message={text.onlyScheduleRws} />;
  }
  const rwId = scheduleRwFor(ctx, await readRwScope(), scheduleRwIds);
  if (rwId === undefined) return <NoScheduleNotice message={cmsCopy.chooseRw} />;
  const query = await loadListQuery(searchParams);
  const [result, packages] = await Promise.all([
    listSchedulesForStaff(query, rwId),
    listSchedulePackages(rwId),
  ]);

  return (
    <ScheduleBoard
      rwId={rwId}
      rwName={rwLabel(rwId)}
      rows={result.rows}
      total={result.total}
      facets={FACETS}
      packages={packages}
      actions={ACTIONS}
    />
  );
}
