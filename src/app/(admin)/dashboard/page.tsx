import { Suspense } from 'react';

import { KopdesOverview } from '@/components/admin/kpi/kopdes-overview';
import { OverviewSkeleton } from '@/components/admin/kpi/overview-skeleton';
import { RwOverview } from '@/components/admin/kpi/rw-overview';
import { SuperadminOverview } from '@/components/admin/kpi/superadmin-overview';
import { OverviewHead } from '@/components/admin/overview/overview-head';
import type { TodayClock } from '@/components/admin/overview/today-panel';
import { RW_SCOPE_ALL, type RwScope } from '@/config/dashboard';
import { ALL_STAFF_ROLES } from '@/config/staff';
import { formatClock } from '@/lib/utils/dates';
import { readCheckInsTodayAction } from '@/server/actions/dashboard';
import { readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff, type DashboardStaff } from '@/server/auth/session';
import { loadRwOverview, loadSuperadminOverview } from '@/server/services/dashboard-stats-service';
import { loadOverviewToday } from '@/server/services/dashboard-today-service';
import { countUmkmCatalogue } from '@/server/services/product-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { NeedsActionItem } from '@/types/dashboard-stats';

// The moment the page is rendered: for the greeting, and for where "now" falls among today's sessions.
function clockOf(now: Date): { now: string; clock: TodayClock } {
  const instant = now.toISOString();
  const label = formatClock(instant);
  return { now: instant, clock: { time: label.replace('.', ':'), label } };
}

function actionCountOf(actions: NeedsActionItem[] | null): number | null {
  return actions === null ? null : actions.length;
}

// The superadmin's figures follow their RwSwitcher; RLS still decides every row.
async function SuperadminSection() {
  const scope = await readRwScope();
  const rw = scope === RW_SCOPE_ALL ? null : scope;
  const { now, clock } = clockOf(new Date());
  const [overview, today, rws] = await Promise.all([
    loadSuperadminOverview(rw),
    loadOverviewToday(rw, true),
    listRwUnitsForStaff(),
  ]);
  return (
    <>
      <OverviewHead now={now} actionCount={actionCountOf(today.actions)} canExport />
      <SuperadminOverview overview={overview} today={today} rws={rws} clock={clock} />
    </>
  );
}

// An RW officer's figures are read for ctx.rwId only, whatever the URL or a cookie says.
async function RwSection({ rwId }: { rwId: number }) {
  const { now, clock } = clockOf(new Date());
  const [overview, today, rws] = await Promise.all([
    loadRwOverview(rwId),
    loadOverviewToday(rwId, false),
    listRwUnitsForStaff(),
  ]);
  return (
    <>
      <OverviewHead now={now} actionCount={actionCountOf(today.actions)} canExport />
      <RwOverview
        overview={overview}
        today={today}
        rws={rws}
        clock={clock}
        readCheckIns={readCheckInsTodayAction}
      />
    </>
  );
}

// docs/PRD.md §13.1 A30: the Kopdes admin's overview is the UMKM catalogue alone.
async function KopdesSection() {
  const { now } = clockOf(new Date());
  return (
    <>
      <OverviewHead now={now} actionCount={null} canExport={false} />
      <KopdesOverview counts={await countUmkmCatalogue()} />
    </>
  );
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
    <Suspense key={key} fallback={<OverviewSkeleton />}>
      <OverviewSection ctx={ctx} />
    </Suspense>
  );
}
