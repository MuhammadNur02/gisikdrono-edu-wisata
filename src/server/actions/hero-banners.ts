'use server';

import { revalidateTag } from 'next/cache';

import { fail, mapError, ok, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { reorderBanners } from '@/lib/utils/hero-banners';
import { rowRefSchema } from '@/lib/validations/content';
import {
  createHeroBannerSchema,
  moveHeroBannerSchema,
  updateHeroBannerSchema,
} from '@/lib/validations/hero-banner';
import { requireAal2, type GuardResult } from '@/server/auth/guards';
import {
  applyBannerOrder,
  createHeroBanner,
  deactivateHeroBanner,
  readBannerOrder,
  removeHeroBanner,
  updateHeroBanner,
} from '@/server/services/hero-banner-service';
import type { ActionResult } from '@/types/action-result';
import type { HeroBannerAdmin } from '@/types/cms';

// /dashboard/settings/hero-banners (Task P2.9.05, docs/PRD.md FR-ADMIN-23): the superadmin's alone, at AAL2, as the
// hero_banners policies say again (0005).

async function requireBannerManager(): Promise<GuardResult> {
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  return guard.ctx.role === 'superadmin' ? guard : fail('FORBIDDEN');
}

export async function createHeroBannerAction(
  input: unknown,
): Promise<ActionResult<HeroBannerAdmin>> {
  const parsed = createHeroBannerSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBannerManager();
  if (!guard.ok) return guard;

  try {
    const banner = await createHeroBanner(guard.ctx.userId, parsed.data);
    revalidateTag(TAGS.banners);
    return ok(banner);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateHeroBannerAction(
  input: unknown,
): Promise<ActionResult<HeroBannerAdmin>> {
  const parsed = updateHeroBannerSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBannerManager();
  if (!guard.ok) return guard;

  try {
    const saved = await updateHeroBanner(guard.ctx, parsed.data);
    revalidateTag(TAGS.banners);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}

export async function removeHeroBannerAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBannerManager();
  if (!guard.ok) return guard;

  try {
    const filesRemoved = await removeHeroBanner(guard.ctx, parsed.data.id);
    revalidateTag(TAGS.banners);
    return okUnlessFilesLeft({ value: null, filesRemoved });
  } catch (error) {
    return mapError(error);
  }
}

// The banner's archive by status (Task P4.9.02): off the home page by is_active, kept with its photos.
export async function deactivateHeroBannerAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBannerManager();
  if (!guard.ok) return guard;

  try {
    await deactivateHeroBanner(parsed.data.id);
    revalidateTag(TAGS.banners);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// One banner a place up or down the home page's order (Task P4.9.02); the order is read from the database, never
// from the form, and renumbered by reorderBanners.
// Answers whether anything moved: a banner already at that end changes nothing and is not reported as moved.
export async function moveHeroBannerAction(input: unknown): Promise<ActionResult<boolean>> {
  const parsed = moveHeroBannerSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBannerManager();
  if (!guard.ok) return guard;

  try {
    const order = await readBannerOrder();
    if (!order.some((banner) => banner.id === parsed.data.id)) return fail('NOT_FOUND');
    const updates = reorderBanners(order, parsed.data.id, parsed.data.direction);
    if (updates.length === 0) return ok(false);
    await applyBannerOrder(updates);
    revalidateTag(TAGS.banners);
    return ok(true);
  } catch (error) {
    return mapError(error);
  }
}
