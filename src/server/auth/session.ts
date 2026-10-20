import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { LOGIN_PATH, MFA_VERIFY_PATH } from '@/config/auth';
import { mfaStepPath, staffNextPath } from '@/lib/utils/staff-paths';
import {
  requireRole,
  type StaffContext,
  type StaffRole,
  type StaffSession,
} from '@/server/auth/guards';

// A staff context whose role is one of the two staff roles, as the dashboard knows it to be.
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

// The gate of every dashboard page (Task P2.8.03, docs/Security.md APP-05, AUTH-03). The layout runs it, and so does
// each page, because Next.js renders a page alongside its layout and does not run the layout again on client
// navigation. requireRole() keeps out a signed-out visitor and an account without a staff role (null: the layout
// says it has no access); an AAL1 session goes to the TOTP step. The restrictive AAL2 policies hold the same line
// in the database. cache() lets the layout and the page of one request share a single check.
export const requireDashboardStaff = cache(async (): Promise<DashboardStaff | null> => {
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) {
    if (guard.error.code === 'UNAUTHENTICATED') redirect(LOGIN_PATH);
    return null;
  }
  const { role } = guard.ctx;
  if (role === 'none') return null;
  if (!guard.ctx.isAal2) redirect(MFA_VERIFY_PATH);
  return { ...guard.ctx, role };
});
