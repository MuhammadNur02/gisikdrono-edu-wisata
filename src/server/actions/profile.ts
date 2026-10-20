'use server';

import { revalidatePath } from 'next/cache';

import { DASHBOARD_PATH } from '@/config/auth';
import { fail, mapError, ok } from '@/lib/errors';
import { updateProfileSchema } from '@/lib/validations/dashboard';
import { requireRole } from '@/server/auth/guards';
import { updateOwnFullName } from '@/server/services/profile-service';
import type { ActionResult } from '@/types/action-result';
import type { StaffProfile } from '@/types/staff';

// /dashboard/profile (Task P2.8.03): a staff member changes their own name and nothing else.
export async function updateProfileAction(input: unknown): Promise<ActionResult<StaffProfile>> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    const profile = await updateOwnFullName(guard.ctx.userId, parsed.data.fullName);
    // The sidebar shows the name on every dashboard page.
    revalidatePath(DASHBOARD_PATH, 'layout');
    return ok(profile);
  } catch (error) {
    return mapError(error);
  }
}
