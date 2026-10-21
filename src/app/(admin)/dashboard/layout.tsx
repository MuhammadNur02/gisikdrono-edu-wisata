import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ContextChip } from '@/components/admin/shell/context-chip';
import { DashboardNav } from '@/components/admin/shell/dashboard-nav';
import { DashboardShell } from '@/components/admin/shell/dashboard-shell';
import { RwSwitcher } from '@/components/admin/shell/rw-switcher';
import { UserCard } from '@/components/admin/shell/user-card';
import { NoAccessNotice } from '@/components/auth/no-access-notice';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { RW_SCOPE_ALL } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { requestNonce } from '@/lib/request-nonce';
import { dashboardNavFor } from '@/lib/utils/dashboard-nav';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import { staffRoleLabel } from '@/lib/utils/staff-labels';
import { setRwScopeAction } from '@/server/actions/dashboard';
import { readRwScope } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { readOwnProfile } from '@/server/services/profile-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';

// Task P2.8.03: the session and the role are read on every request (CLAUDE.md §5.1); next.config.ts adds
// `private, no-store` and noindex headers for /dashboard as well.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: copy.dashboard.home.title, template: `%s | ${copy.dashboard.home.title}` },
  robots: { index: false, follow: false },
};

// requireDashboardStaff() has sent a signed-out visitor to /login and an AAL1 session to /mfa/verify already.
export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const nonce = await requestNonce();
  const ctx = await requireDashboardStaff();
  if (!ctx) {
    return (
      <ThemeProvider scope="public" nonce={nonce}>
        <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
          <NoAccessNotice />
        </main>
      </ThemeProvider>
    );
  }

  const [profile, rwUnits] = await Promise.all([readOwnProfile(ctx.userId), listRwUnitsForStaff()]);
  const ownRw = rwUnits.find((unit) => unit.id === ctx.rwId) ?? null;
  const scope = ctx.role === 'superadmin' ? await readRwScope() : RW_SCOPE_ALL;
  return (
    <ThemeProvider scope="admin" nonce={nonce}>
      <DashboardShell
        nav={<DashboardNav groups={dashboardNavFor(ctx.role, ownRw)} />}
        footer={<UserCard fullName={profile.fullName} roleLabel={staffRoleLabel(ctx.rwId)} />}
        context={<ContextChip rw={ctx.rwId === null ? null : rwBadgeFor(ctx.rwId, rwUnits)} />}
        rwSwitcher={
          ctx.role === 'superadmin' ? (
            <RwSwitcher scope={scope} rws={rwUnits} action={setRwScopeAction} />
          ) : null
        }
      >
        {children}
      </DashboardShell>
    </ThemeProvider>
  );
}
