'use server';

import { revalidateTag } from 'next/cache';

import { STEP_UP_MAX_AGE_SECONDS } from '@/config/auth';
import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { siteSettingsSchema } from '@/lib/validations/settings';
import { requireFreshTotp } from '@/server/auth/guards';
import { updateSiteSettings } from '@/server/services/settings-service';
import type { ActionResult } from '@/types/action-result';

// /dashboard/settings (Task P4.9.01, docs/PRD.md §8.6): the superadmin's alone, at AAL2 with a TOTP code from the last
// five minutes, which the form asks for through verifyStaffTotpAction right before it saves; the site_settings policies
// require the same again. booking_enabled is not part of the schema, so it cannot change here until Task P3.12.
// Answers how many settings changed.
export async function updateSiteSettingsAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = siteSettingsSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireFreshTotp(STEP_UP_MAX_AGE_SECONDS);
  if (!guard.ok) return guard;
  if (guard.ctx.role !== 'superadmin') return fail('FORBIDDEN');

  try {
    const changed = await updateSiteSettings(guard.ctx, parsed.data);
    revalidateTag(TAGS.settings);
    return ok(changed);
  } catch (error) {
    return mapError(error);
  }
}
