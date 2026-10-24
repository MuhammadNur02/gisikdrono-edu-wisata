'use server';

import { revalidatePath } from 'next/cache';

import { SECURITY_ALERTS_PATH, STAFF_STEP_UP_MAX_AGE_SECONDS } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { fail, mapError, ok } from '@/lib/errors';
import { acknowledgeAlertSchema } from '@/lib/validations/security';
import { requireFreshTotp, requireRole } from '@/server/auth/guards';
import { acknowledgeSecurityAlert } from '@/server/services/security-service';
import type { ActionResult } from '@/types/action-result';

// /dashboard/security-alerts (Task P4.10.02): an acknowledged alert stops calling for attention, so the superadmin
// confirms with a fresh authenticator code (docs/Security.md §5.3), as security_alerts_fresh_totp_update requires.
export async function acknowledgeSecurityAlertAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = acknowledgeAlertSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS);
  if (!guard.ok) return fail('FORBIDDEN', undefined, staffCopy.notFresh);

  try {
    await acknowledgeSecurityAlert(guard.ctx, parsed.data.alertId);
    revalidatePath(SECURITY_ALERTS_PATH);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
