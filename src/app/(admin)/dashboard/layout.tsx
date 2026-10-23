import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { CommandMenu } from '@/components/admin/shell/command-menu';
import { ContextChip } from '@/components/admin/shell/context-chip';
import { DashboardNav } from '@/components/admin/shell/dashboard-nav';
import { DashboardShell } from '@/components/admin/shell/dashboard-shell';
import { IdleLock } from '@/components/admin/shell/idle-lock';
import { RwSwitcher } from '@/components/admin/shell/rw-switcher';
import { UserCard } from '@/components/admin/shell/user-card';
import { UserMenu } from '@/components/admin/shell/user-menu';
import { NoAccessNotice } from '@/components/auth/no-access-notice';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { RW_SCOPE_ALL, SIDEBAR_STATE_COOKIE } from '@/config/dashboard';
import type { DashboardNavGroup } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { requestNonce } from '@/lib/request-nonce';
import { dashboardNavFor } from '@/lib/utils/dashboard-nav';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import { staffRoleLabel } from '@/lib/utils/staff-labels';
import { setRwScopeAction } from '@/server/actions/dashboard';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff, type DashboardStaff } from '@/server/auth/session';
import { readOwnProfile } from '@/server/services/profile-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';

// Task P2.8.03, final in P4.1.01: the session and the role are read on every request (CLAUDE.md §5.1);
// next.config.ts adds `private, no-store` and noindex headers for /dashboard as well.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: copy.dashboard.home.title, template: `%s | ${copy.dashboard.home.title}` },
  robots: { index: false, follow: false },
};

// The sidebar opens expanded unless the browser last left it as the icon rail.
async function readSidebarOpen(): Promise<boolean> {
  return (await cookies()).get(SIDEBAR_STATE_COOKIE)?.value !== 'false';
}

// The menu flattened for the breadcrumb and the command palette (plain values: they cross into client components).
function flattenNav(groups: readonly DashboardNavGroup[]) {
  return groups.flatMap((group) =>
    group.items.map((item) => ({ group: group.title, label: item.label, href: item.href })),
  );
}

// A signed-in account without a staff role: told so, on the public theme.
function NoAccess({ nonce }: { nonce: string | undefined }) {
  return (
    <ThemeProvider scope="public" nonce={nonce}>
      <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <NoAccessNotice />
      </main>
    </ThemeProvider>
  );
}

// What the shell shows for this staff member: their profile, every RW, and the superadmin's scope.
async function loadShell(ctx: DashboardStaff) {
  const [profile, rwUnits, sidebarOpen] = await Promise.all([
    readOwnProfile(ctx.userId),
    listRwUnitsForStaff(),
    readSidebarOpen(),
  ]);
  const scope = ctx.role === 'superadmin' ? await readRwScope() : RW_SCOPE_ALL;
  const ownRw = rwUnits.find((unit) => unit.id === ctx.rwId) ?? null;
  return { profile, rwUnits, sidebarOpen, scope, groups: dashboardNavFor(ctx.role, ownRw) };
}

// requireDashboardStaff() has sent a signed-out visitor to /login and an AAL1 session to the TOTP step already.
export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const nonce = await requestNonce();
  const ctx = await requireDashboardStaff();
  if (!ctx) return <NoAccess nonce={nonce} />;

  const { profile, rwUnits, sidebarOpen, scope, groups } = await loadShell(ctx);
  const menuItems = flattenNav(groups);
  const roleLabel = staffRoleLabel(ctx.rwId);
  return (
    <ThemeProvider scope="admin" nonce={nonce}>
      <DashboardShell
        sidebarOpen={sidebarOpen}
        nav={<DashboardNav groups={groups} />}
        footer={<UserCard fullName={profile.fullName} roleLabel={roleLabel} />}
        context={<ContextChip rw={ctx.rwId === null ? null : rwBadgeFor(ctx.rwId, rwUnits)} />}
        breadcrumbItems={menuItems}
        rwSwitcher={
          ctx.role === 'superadmin' ? (
            <RwSwitcher scope={scope} rws={rwUnits} action={setRwScopeAction} />
          ) : null
        }
        commandMenu={<CommandMenu items={menuItems} />}
        userMenu={<UserMenu fullName={profile.fullName} roleLabel={roleLabel} />}
        idleLock={<IdleLock action={verifyStaffTotpAction} />}
      >
        {children}
      </DashboardShell>
    </ThemeProvider>
  );
}
