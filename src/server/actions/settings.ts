'use server';

import { revalidateTag } from 'next/cache';

import { STEP_UP_MAX_AGE_SECONDS } from '@/config/auth';
import { UMKM_MANAGER_ROLES } from '@/config/staff';
import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { catalogueSettingsSchema, siteSettingsSchema } from '@/lib/validations/settings';
import { requireFreshTotp } from '@/server/auth/guards';
import { updateCatalogueSettings, updateSiteSettings } from '@/server/services/settings-service';
import type { ActionResult } from '@/types/action-result';

// The public reads cache under settings, and the product reads under settings too (catalogue.show_product_prices);
// products are named as well, so the price switch reaches every product page even if a read forgets its settings tag.
// Run after a failure too: the keys are written one row each, so one part-way may follow keys that did save (review
// of PR #40).
function revalidateSettings(): void {
  revalidateTag(TAGS.settings);
  revalidateTag(TAGS.allProducts);
}

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
    revalidateSettings();
    return ok(changed);
  } catch (error) {
    revalidateSettings();
    return mapError(error);
  }
}

// Pengaturan Katalog (docs/PRD.md §13.1 A30): the three catalogue keys, which the Kopdes admin edits as the superadmin
// does, with the same fresh TOTP code; site_settings_kopdes_update and site_settings_kopdes_guard hold it to those keys
// and their values in the database. Answers how many settings changed.
export async function updateCatalogueSettingsAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = catalogueSettingsSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireFreshTotp(STEP_UP_MAX_AGE_SECONDS, UMKM_MANAGER_ROLES);
  if (!guard.ok) return guard;

  try {
    const changed = await updateCatalogueSettings(guard.ctx, parsed.data);
    revalidateSettings();
    return ok(changed);
  } catch (error) {
    revalidateSettings();
    return mapError(error);
  }
}
