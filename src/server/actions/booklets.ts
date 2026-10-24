'use server';

import { revalidateTag } from 'next/cache';

import { copy } from '@/lib/copy/id';
import { fail, mapError, ok, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { saveBookletSchema } from '@/lib/validations/booklet';
import { rowRefSchema } from '@/lib/validations/content';
import { canWriteFor, requireNewContentOwner } from '@/server/auth/content-owner';
import { requireAal2 } from '@/server/auth/guards';
import {
  archiveBooklet,
  createBooklet,
  readBookletOwner,
  removeBooklet,
  updateBooklet,
} from '@/server/services/booklet-service';
import type { ActionResult } from '@/types/action-result';
import type { BookletAdmin } from '@/types/cms';

// /dashboard/booklets (Task P2.9.05, docs/PRD.md FR-ADMIN-12). A new booklet belongs to the RW admin's own RW, or for
// the superadmin to the RW the RwSwitcher points at (the kelurahan under Semua); an existing one to the owner the
// database holds. Only the superadmin removes one (booklets_super_delete, 0005).

export async function createBookletAction(input: unknown): Promise<ActionResult<BookletAdmin>> {
  const parsed = saveBookletSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const target = await requireNewContentOwner(guard.ctx, { rwOnly: false });
  if (!target.ok) return target;

  try {
    const booklet = await createBooklet(guard.ctx, target.owner, parsed.data);
    revalidateTag(TAGS.booklets);
    return ok(booklet);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateBookletAction(input: unknown): Promise<ActionResult<BookletAdmin>> {
  const parsed = saveBookletSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const owner = await readBookletOwner(parsed.data.id);
    if (owner === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, owner)) return fail('FORBIDDEN');
    const booklet = await updateBooklet(owner, parsed.data);
    revalidateTag(TAGS.booklets);
    return ok(booklet);
  } catch (error) {
    return mapError(error);
  }
}

export async function removeBookletAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  if (guard.ctx.role !== 'superadmin') {
    return fail('FORBIDDEN', undefined, copy.cms.booklets.removeOnlySuper);
  }

  try {
    const owner = await readBookletOwner(parsed.data.id);
    if (owner === undefined) return fail('NOT_FOUND');
    const filesRemoved = await removeBooklet(guard.ctx, owner, parsed.data.id);
    revalidateTag(TAGS.booklets);
    return okUnlessFilesLeft({ value: null, filesRemoved });
  } catch (error) {
    return mapError(error);
  }
}

// Archive by status instead of a delete (Task P4.3.03): the owner's admin or the superadmin.
export async function archiveBookletAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const owner = await readBookletOwner(parsed.data.id);
    if (owner === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, owner)) return fail('FORBIDDEN');
    await archiveBooklet(owner, parsed.data.id);
    revalidateTag(TAGS.booklets);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
