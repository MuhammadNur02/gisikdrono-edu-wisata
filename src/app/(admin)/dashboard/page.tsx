import { Suspense } from 'react';

import { KopdesOverview } from '@/components/admin/kpi/kopdes-overview';
import { OverviewSkeleton } from '@/components/admin/kpi/overview-skeleton';
import { RwOverview } from '@/components/admin/kpi/rw-overview';
import { SuperadminOverview } from '@/components/admin/kpi/superadmin-overview';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { RW_SCOPE_ALL, type RwScope } from '@/config/dashboard';
import { ALL_STAFF_ROLES } from '@/config/staff';
import { copy } from '@/lib/copy/id';
import { staffRoleLabel } from '@/lib/utils/staff-labels';
import { readCheckInsTodayAction } from '@/server/actions/dashboard';
import { readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff, type DashboardStaff } from '@/server/auth/session';
import { loadRwOverview, loadSuperadminOverview } from '@/server/services/dashboard-stats-service';
import { countUmkmCatalogue } from '@/server/services/product-service';

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

// docs/PRD.md §13.1 A30: the Kopdes admin's overview is the UMKM catalogue alone.
async function KopdesSection() {
  return <KopdesOverview counts={await countUmkmCatalogue()} />;
}

// Each role's own figures: the superadmin's kelurahan, an RW officer's RW, the Kopdes admin's UMKM catalogue.
function OverviewSection({ ctx }: { ctx: DashboardStaff }) {
  if (ctx.role === 'superadmin') return <SuperadminSection />;
  if (ctx.role === 'admin_kopdes') return <KopdesSection />;
  return ctx.rwId === null ? null : <RwSection rwId={ctx.rwId} />;
}

// The RW switch (setRwScopeAction) renders the page again inside a React transition, which keeps the figures already
// on screen, and the switcher's buttons disabled, until the new figures have all been read: under load that took
// longer than the switch can wait (e2e staff-sign-in, PR #68). Keyed by the scope, the overview is a new Suspense
// boundary for each RW, so the switch completes at once with the skeleton and the figures stream in after it.
function overviewKey(role: string, scope: RwScope): string {
  return role === 'superadmin' ? `overview:${String(scope)}` : 'overview';
}

// Task P4.2.03: the overview, role-aware on the server only (docs/Security.md DATA-04).
export default async function DashboardPage() {
  const ctx = await requireDashboardStaff(ALL_STAFF_ROLES);
  if (!ctx) return null;
  const key = overviewKey(ctx.role, ctx.role === 'superadmin' ? await readRwScope() : RW_SCOPE_ALL);

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.signedInAs(staffRoleLabel(ctx.role, ctx.rwId))}
      />
      <Suspense key={key} fallback={<OverviewSkeleton />}>
        <OverviewSection ctx={ctx} />
      </Suspense>
    </>
  );
}
