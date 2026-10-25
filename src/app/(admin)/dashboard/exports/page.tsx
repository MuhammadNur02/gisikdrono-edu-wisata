import type { Metadata } from 'next';

import { ExportButton } from '@/components/admin/exports/export-button';
import { ExportTable } from '@/components/admin/exports/export-table';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { DB_ENUMS } from '@/db/enums';
import { exportsCopy as text } from '@/lib/copy/exports';
import { todayInJakarta } from '@/lib/utils/dates';
import { listFacets, rwFacet } from '@/lib/utils/facets';
import { visitDateAfter } from '@/lib/utils/kpi';
import { loadListQuery } from '@/lib/utils/list-query';
import { requireDashboardStaff } from '@/server/auth/session';
import { listExports } from '@/server/services/export-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The form opens on the last 30 days up to today.
const DEFAULT_PERIOD_DAYS = 30;

const KIND_FACET: ListFacet = {
  param: 'status',
  title: text.history.columns.kind,
  options: DB_ENUMS.export_kind.map((kind) => ({ value: kind, label: text.kinds[kind] })),
};

// Task P4.6.03 (docs/PRD.md FR-ADMIN-22, docs/Security.md §7.5; AUD-04, DATA-06): a new export behind the mandatory
// purpose, and the history with row counts and expiry, downloadable again within its 24 hours. The superadmin exports
// every kind and sees every export; an RW admin exports and sees the attendance of their own RW only (the route, RLS and
// rpc_create_export each hold that line).
export default async function ExportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const isSuperadmin = ctx.role === 'superadmin';
  const query = await loadListQuery(searchParams);
  const rwUnits = await listRwUnitsForStaff();
  const rw = isSuperadmin && rwUnits.some((unit) => unit.id === query.rw) ? query.rw : null;
  const history = await listExports(query, rw);
  const today = todayInJakarta();
  const createAction = (
    <ExportButton
      isSuperadmin={isSuperadmin}
      rwUnits={rwUnits.map((unit) => ({ id: unit.id, name: unit.name }))}
      defaultFrom={visitDateAfter(today, -DEFAULT_PERIOD_DAYS)}
      defaultTo={today}
    />
  );
  const facets = listFacets(isSuperadmin, {
    rw: rwFacet(text.fields.rw, rwUnits),
    others: isSuperadmin ? [KIND_FACET] : [],
  });
  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={isSuperadmin ? text.description : text.descriptionRw}
      />
      <ExportTable
        rows={history.rows}
        total={history.total}
        facets={facets}
        createAction={createAction}
      />
    </>
  );
}
