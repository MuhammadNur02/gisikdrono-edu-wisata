'use server';

import { revalidateTag } from 'next/cache';

import { fail, mapError, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { saveRwPageSchema } from '@/lib/validations/rw-page';
import { requireRwContentOwner } from '@/server/auth/content-owner';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { updateRwPage } from '@/server/services/rw-page-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { RwPageAdmin } from '@/types/cms';

// /dashboard/pages (Task P2.9.05 and P4.3.03, docs/PRD.md FR-ADMIN-15). The page edited is the RW admin's own, whatever
// the form says, and an RW admin's form that names an RW is refused; the superadmin names the RW whose row of the list
// they opened, which rw_units must hold, or else edits the one the RwSwitcher points at.

async function rwPageTarget(
  ctx: StaffContext,
  requested: number | undefined,
): Promise<{ ok: true; rwId: number } | ActionFailure> {
  if (requested === undefined) return requireRwContentOwner(ctx);
  if (ctx.role !== 'superadmin') return fail('FORBIDDEN');
  const rwUnits = await listRwUnitsForStaff();
  return rwUnits.some((unit) => unit.id === requested)
    ? { ok: true, rwId: requested }
    : fail('NOT_FOUND');
}

export async function updateRwPageAction(input: unknown): Promise<ActionResult<RwPageAdmin>> {
  const parsed = saveRwPageSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const { rwId: requested, ...values } = parsed.data;

  try {
    const target = await rwPageTarget(guard.ctx, requested);
    if (!target.ok) return target;
    const saved = await updateRwPage(guard.ctx, target.rwId, values);
    revalidateTag(TAGS.rwUnits);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}
