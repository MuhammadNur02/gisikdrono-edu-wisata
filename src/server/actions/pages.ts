'use server';

import { revalidateTag } from 'next/cache';

import { mapError, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { updateRwPageSchema } from '@/lib/validations/rw-page';
import { requireRwContentOwner } from '@/server/auth/content-owner';
import { requireAal2 } from '@/server/auth/guards';
import { updateRwPage } from '@/server/services/rw-page-service';
import type { ActionResult } from '@/types/action-result';
import type { RwPageAdmin } from '@/types/cms';

// /dashboard/pages (Task P2.9.05, docs/PRD.md FR-ADMIN-15). The page edited is the RW admin's own or the RW the
// superadmin's RwSwitcher points at; the form names no RW at all.
export async function updateRwPageAction(input: unknown): Promise<ActionResult<RwPageAdmin>> {
  const parsed = updateRwPageSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const target = await requireRwContentOwner(guard.ctx);
  if (!target.ok) return target;

  try {
    const saved = await updateRwPage(guard.ctx, target.rwId, parsed.data);
    revalidateTag(TAGS.rwUnits);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}
