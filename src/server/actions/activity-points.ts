'use server';

import { revalidateTag } from 'next/cache';

import { fail, mapError, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { saveActivityPointSchema } from '@/lib/validations/activity-point';
import { rowRefSchema } from '@/lib/validations/content';
import { canWriteFor, requireRwContentOwner } from '@/server/auth/content-owner';
import { requireAal2 } from '@/server/auth/guards';
import {
  createActivityPoint,
  readActivityPointOwner,
  removeActivityPoint,
  updateActivityPoint,
} from '@/server/services/activity-point-service';
import type { ActionResult } from '@/types/action-result';
import type { ActivityPointAdmin } from '@/types/cms';

// /dashboard/activity-points (Task P2.9.05, docs/PRD.md FR-ADMIN-14). A new point belongs to the RW admin's own RW or
// the RW the superadmin's RwSwitcher points at; an existing one to the RW the database holds, which the staff member
// must be allowed to write before anything changes.

export async function createActivityPointAction(
  input: unknown,
): Promise<ActionResult<ActivityPointAdmin>> {
  const parsed = saveActivityPointSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const target = await requireRwContentOwner(guard.ctx);
  if (!target.ok) return target;

  try {
    const saved = await createActivityPoint(guard.ctx, target.rwId, parsed.data);
    revalidateTag(TAGS.activityPoints(target.rwId));
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateActivityPointAction(
  input: unknown,
): Promise<ActionResult<ActivityPointAdmin>> {
  const parsed = saveActivityPointSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const rwId = await readActivityPointOwner(parsed.data.id);
    if (rwId === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, rwId)) return fail('FORBIDDEN');
    const saved = await updateActivityPoint(guard.ctx, rwId, parsed.data);
    revalidateTag(TAGS.activityPoints(rwId));
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}

export async function removeActivityPointAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const rwId = await readActivityPointOwner(parsed.data.id);
    if (rwId === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, rwId)) return fail('FORBIDDEN');
    const filesRemoved = await removeActivityPoint(guard.ctx, rwId, parsed.data.id);
    revalidateTag(TAGS.activityPoints(rwId));
    return okUnlessFilesLeft({ value: null, filesRemoved });
  } catch (error) {
    return mapError(error);
  }
}
