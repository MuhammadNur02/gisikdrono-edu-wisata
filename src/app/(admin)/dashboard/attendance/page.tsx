import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ScanHistoryTable } from '@/components/admin/attendance/scan-history-table';
import { TodayList } from '@/components/admin/attendance/today-list';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { ATTENDANCE_HISTORY_DAYS } from '@/config/attendance';
import { SCAN_RESULT } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { attendanceCopy } from '@/lib/copy/attendance';
import { attendanceDateOf } from '@/lib/utils/attendance';
import { formatDateLong, todayInJakarta } from '@/lib/utils/dates';
import { listFacets, rwFacet } from '@/lib/utils/facets';
import { visitDateAfter } from '@/lib/utils/kpi';
import { loadListQuery } from '@/lib/utils/list-query';
import { effectiveRw } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listScanHistory, listTodayAttendance } from '@/server/services/attendance-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

const text = attendanceCopy;
const HISTORY_HEADING_ID = 'scan-history';

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// `?status=` holds the scan results the history is narrowed to.
const RESULT_FACET: ListFacet = {
  param: 'status',
  title: text.history.facets.result,
  options: DB_ENUMS.scan_result.map((result) => ({
    value: result,
    label: SCAN_RESULT[result].label,
  })),
};

// Task P4.3.09, docs/PRD.md FR-ADMIN-06: today's gate list and a day's scan history from
// `?date=&q=&status=&rw=&sort=&page=`. An RW admin reads their own RW whatever the URL says; the superadmin the RW
// effectiveRw settles. Read-only until the check-in RPCs of P4.4 exist.
export default async function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const today = todayInJakarta();
  const date = attendanceDateOf(query.date, today);
  const isToday = date === today;
  const [rw, rwUnits] = await Promise.all([effectiveRw(ctx, query.rw), listRwUnitsForStaff()]);
  if (ctx.role === 'admin_rw' && rw === null) return null;
  const [tickets, history] = await Promise.all([
    isToday ? listTodayAttendance(rw) : Promise.resolve(null),
    listScanHistory(query, rw, date),
  ]);
  const facets = listFacets(ctx.role === 'superadmin', {
    status: RESULT_FACET,
    rw: rwFacet(text.history.facets.rw, rwUnits),
  });

  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="flex flex-col gap-6">
        {isToday ? <TodayList tickets={tickets} /> : null}
        <HistorySection date={date}>
          <ScanHistoryTable
            rows={history.rows}
            total={history.total}
            facets={facets}
            dateFilter={{
              date,
              today,
              earliest: visitDateAfter(today, -ATTENDANCE_HISTORY_DAYS),
            }}
          />
        </HistorySection>
      </div>
    </>
  );
}

function HistorySection({ date, children }: { date: string; children: ReactNode }) {
  return (
    <section aria-labelledby={HISTORY_HEADING_ID} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={HISTORY_HEADING_ID} className="text-h4">
          {`${text.history.title} · ${formatDateLong(date)}`}
        </h2>
        <p className="text-body-sm text-muted-foreground">{text.history.description}</p>
      </div>
      {children}
    </section>
  );
}
