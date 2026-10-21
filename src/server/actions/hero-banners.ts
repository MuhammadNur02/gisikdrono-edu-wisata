'use server';

import { revalidateTag } from 'next/cache';

import { fail, mapError, ok, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { rowRefSchema } from '@/lib/validations/content';
import { createHeroBannerSchema, updateHeroBannerSchema } from '@/lib/validations/hero-banner';
import { requireAal2, type GuardResult } from '@/server/auth/guards';
import {
  createHeroBanner,
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
