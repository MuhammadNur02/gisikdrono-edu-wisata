import { Suspense } from 'react';

import { OverviewSkeleton } from '@/components/admin/kpi/overview-skeleton';
import { RwOverview } from '@/components/admin/kpi/rw-overview';
import { SuperadminOverview } from '@/components/admin/kpi/superadmin-overview';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { RW_SCOPE_ALL } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { staffRoleLabel } from '@/lib/utils/staff-labels';
import { readCheckInsTodayAction } from '@/server/actions/dashboard';
import { readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { loadRwOverview, loadSuperadminOverview } from '@/server/services/dashboard-stats-service';

const text = copy.dashboard.home;

// The superadmin's figures follow their RwSwitcher; RLS still decides every row.
async function SuperadminSection() {
  const scope = await readRwScope();
  const overview = await loadSuperadminOverview(scope === RW_SCOPE_ALL ? null : scope);
  return <SuperadminOverview overview={overview} />;
}

// An RW officer's figures are read for ctx.rwId only, whatever the URL or a cookie says.
async function RwSection({ rwId }: { rwId: number }) {
  const overview = await loadRwOverview(rwId);
  return <RwOverview overview={overview} readCheckIns={readCheckInsTodayAction} />;
}

// Task P4.2.03: the overview, role-aware on the server only (docs/Security.md DATA-04).
export default async function DashboardPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.signedInAs(staffRoleLabel(ctx.rwId))}
      />
      <Suspense fallback={<OverviewSkeleton />}>
        {ctx.role === 'superadmin' ? (
          <SuperadminSection />
        ) : ctx.rwId === null ? null : (
          <RwSection rwId={ctx.rwId} />
        )}
      </Suspense>
    </>
  );
}
