'use server';

import { headers } from 'next/headers';

import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { stepUpSchema } from '@/lib/validations/step-up';
import { requireAal2 } from '@/server/auth/guards';
import { verifyTotp } from '@/server/services/auth-service';
import { withinStepUpLimit } from '@/server/services/staff-service';
import type { ActionResult } from '@/types/action-result';

// A signed-in AAL2 staff member proving they are still at the keyboard (Task P4.1.01, docs/Security.md AUTH-11): the
// idle lock's `Lanjutkan` and the step-up dialog before a critical action both run the same TOTP check, which also
// refreshes the `amr` timestamp public.fresh_totp() reads. The account is already signed in, so there is no captcha;
// the per-account limit and Auth's own limits stand in front of a walk-up guessing codes. A wrong code is logged by
// the staff member's id only.
export async function verifyStaffTotpAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = stepUpSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const text = copy.auth.mfa;
    if (!(await withinStepUpLimit(guard.ctx.userId))) {
      return fail('RATE_LIMITED', undefined, text.locked);
    }
    const check = await verifyTotp(parsed.data.code);
    if (check === 'verified') return ok(null);
    const event = check === 'locked' ? 'mfa_locked' : 'mfa_failed';
    createLogger(requestIdFrom(await headers())).warn(event, { userId: guard.ctx.userId });
    if (check === 'locked') return fail('RATE_LIMITED', undefined, text.locked);
    return fail('VALIDATION', { code: [text.failed] }, text.failed);
  } catch (error) {
    return mapError(error);
  }
}
