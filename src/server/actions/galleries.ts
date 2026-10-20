'use server';

import { revalidateTag } from 'next/cache';

import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { contentOwnerTagOf } from '@/lib/utils/content-owner';
import { rowRefSchema } from '@/lib/validations/content';
import { createGalleryItemSchema, updateGalleryItemSchema } from '@/lib/validations/gallery';
import { canWriteFor, requireNewContentOwner } from '@/server/auth/content-owner';
import { requireAal2 } from '@/server/auth/guards';
import {
  createGalleryItem,
  readGalleryOwner,
  removeGalleryItem,
  updateGalleryItem,
} from '@/server/services/gallery-service';
import type { ActionResult } from '@/types/action-result';
import type { GalleryItemAdmin } from '@/types/cms';

// /dashboard/galleries (Task P2.9.05, docs/PRD.md FR-ADMIN-10). A new item belongs to the RW admin's own RW, or for
// the superadmin to the RW the RwSwitcher points at (the kelurahan under Semua); an existing one to the owner the
// database holds, which the staff member must be allowed to write.

export async function createGalleryItemAction(
  input: unknown,
): Promise<ActionResult<GalleryItemAdmin>> {
  const parsed = createGalleryItemSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const target = await requireNewContentOwner(guard.ctx, { rwOnly: false });
  if (!target.ok) return target;

  try {
    const item = await createGalleryItem(guard.ctx, target.owner, parsed.data);
    revalidateTag(TAGS.galleries(contentOwnerTagOf(target.owner)));
    return ok(item);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateGalleryItemAction(
  input: unknown,
): Promise<ActionResult<GalleryItemAdmin>> {
  const parsed = updateGalleryItemSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const owner = await readGalleryOwner(parsed.data.id);
    if (owner === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, owner)) return fail('FORBIDDEN');
    const item = await updateGalleryItem(owner, parsed.data);
    revalidateTag(TAGS.galleries(contentOwnerTagOf(owner)));
    return ok(item);
  } catch (error) {
    return mapError(error);
  }
}

export async function removeGalleryItemAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const owner = await readGalleryOwner(parsed.data.id);
    if (owner === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, owner)) return fail('FORBIDDEN');
    await removeGalleryItem(guard.ctx, owner, parsed.data.id);
    revalidateTag(TAGS.galleries(contentOwnerTagOf(owner)));
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
