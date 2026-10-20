import 'server-only';

import { redirect } from 'next/navigation';

import { mfaStepPath, staffNextPath } from '@/lib/utils/staff-paths';
import type { StaffSession } from '@/server/auth/guards';

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
