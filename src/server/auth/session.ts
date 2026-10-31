import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { DASHBOARD_PATH, LOGIN_PATH, MFA_VERIFY_PATH } from '@/config/auth';
import { ALL_STAFF_ROLES, EDU_WISATA_ROLES } from '@/config/staff';
import { mfaStepPath, staffNextPath } from '@/lib/utils/staff-paths';
import {
  requireRole,
  type StaffContext,
  type StaffRole,
  type StaffSession,
} from '@/server/auth/guards';

// A staff context whose role is one of the staff roles, as the dashboard knows it to be.
export type DashboardStaff = StaffContext & { role: StaffRole };

// The sign-in pages send a staff member who is already further along on to where they belong: the dashboard once
// the session is at AAL2, the TOTP step before that. An account without a role stays, so the page can say that it
// has no access instead of looping between sign-in steps.
export function redirectSignedInStaff(
  session: StaffSession | null,
  next: string | undefined,
): void {
  if (!session || session.ctx.role === 'none') return;
  redirect(session.ctx.isAal2 ? staffNextPath(next) : mfaStepPath(session.hasVerifiedTotp, next));
}

// The staff member behind this request, whatever their role, or null for an account without one (the layout says it
// has no access); a signed-out visitor goes to /login and an AAL1 session to the TOTP step. cache() lets the layout
// and the page of one request share a single check.
const readDashboardStaff = cache(async (): Promise<DashboardStaff | null> => {
  const guard = await requireRole(...ALL_STAFF_ROLES);
  if (!guard.ok) {
    if (guard.error.code === 'UNAUTHENTICATED') redirect(LOGIN_PATH);
    return null;
  }
  const { role } = guard.ctx;
  if (role === 'none') return null;
  if (!guard.ctx.isAal2) redirect(MFA_VERIFY_PATH);
  return { ...guard.ctx, role };
});

// The gate of every dashboard page (Task P2.8.03, docs/Security.md APP-05, AUTH-03). The layout runs it, and so does
// each page, because Next.js renders a page alongside its layout and does not run the layout again on client
// navigation. `roles` are the staff who may open the page; without them the edu-wisata staff, so a page that names
// none stays closed to the Kopdes admin (docs/PRD.md §13.1 A30), who is sent to the overview instead. The layout names
// every role. The restrictive AAL2 policies and the role checks of RLS hold the same line in the database.
export async function requireDashboardStaff(
  roles: readonly StaffRole[] = EDU_WISATA_ROLES,
): Promise<DashboardStaff | null> {
  const staff = await readDashboardStaff();
  if (!staff) return null;
  if (!roles.includes(staff.role)) redirect(DASHBOARD_PATH);
  return staff;
}
