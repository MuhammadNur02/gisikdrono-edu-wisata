'use server';

import { revalidateTag } from 'next/cache';

import type { RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { comboMayPublish } from '@/lib/utils/package-tiers';
import { rowRefSchema } from '@/lib/validations/content';
import {
  createPackageSchema,
  updatePackageSchema,
  type PackageValues,
} from '@/lib/validations/package';
import { canWriteFor, requireRwContentOwner } from '@/server/auth/content-owner';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { readPackageForStaff } from '@/server/services/package-service';
import {
  archivePackage,
  createPackage,
  updatePackage,
} from '@/server/services/package-write-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { PackageAdmin } from '@/types/package';

// /dashboard/packages (Task P4.3.05, docs/PRD.md FR-ADMIN-05, REC-13, REC-14). An RW package belongs to the RW admin's
// own RW, or for the superadmin to the RW the RwSwitcher points at; a combo is the superadmin's alone and belongs to
// the kelurahan (tour_packages_owner_ok). The owner never comes from the form, and RLS plus the combo trigger check
// the same again. A combo's legs are not edited here yet (save_package RPC, Task P4.3.11), so a combo goes on sale
// only once legs written elsewhere visit two RWs (tour_packages_legs_guard).

const text = copy.packages;

type OwnerResult = { ok: true; owner: RwId | null } | ActionFailure;

async function ownerOfNewPackage(ctx: StaffContext, values: PackageValues): Promise<OwnerResult> {
  if (values.category === 'combo') {
    return ctx.role === 'superadmin'
      ? { ok: true, owner: null }
      : fail('FORBIDDEN', undefined, text.comboOnlySuper);
  }
  const target = await requireRwContentOwner(ctx);
  return target.ok ? { ok: true, owner: target.rwId } : target;
}

// The guard half of tour_packages_legs_guard: a combo that is not on sale yet stays off it without two RWs' legs.
function refusedPublish(values: PackageValues, current: PackageAdmin | null): ActionFailure | null {
  const becomesPublished = values.status === 'published' && current?.status !== 'published';
  if (values.category !== 'combo' || !becomesPublished) return null;
  return comboMayPublish(current?.rwIds ?? [])
    ? null
    : fail('STATE_INVALID', { status: [text.errors.comboNeedsLegs] }, text.errors.comboNeedsLegs);
}

// An RW admin edits their own RW's packages and reads a combo only. A package never turns into a combo or back: the
// owner would have to move with it.
function refusedChange(
  ctx: StaffContext,
  current: PackageAdmin,
  values: PackageValues,
): ActionFailure | null {
  const isCombo = current.category === 'combo';
  if (!canWriteFor(ctx, current.rwId)) {
    return fail('FORBIDDEN', undefined, isCombo ? text.comboReadOnly : undefined);
  }
  if (isCombo !== (values.category === 'combo')) {
    return fail('STATE_INVALID', undefined, text.errors.categoryLocked);
  }
  return refusedPublish(values, current);
}

// The database's STATE_INVALID on a package is the combo publish guard; it gets the package's own words.
async function mapPackageError(error: unknown): Promise<ActionFailure> {
  const failure = await mapError(error);
  return failure.error.code === 'STATE_INVALID'
    ? fail('STATE_INVALID', undefined, text.errors.comboNeedsLegs)
    : failure;
}

export async function createPackageAction(input: unknown): Promise<ActionResult<PackageAdmin>> {
  const parsed = createPackageSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  const target = await ownerOfNewPackage(guard.ctx, parsed.data);
  if (!target.ok) return target;
  const refused = refusedPublish(parsed.data, null);
  if (refused) return refused;

  try {
    const created = await createPackage(guard.ctx, target.owner, parsed.data);
    revalidateTag(TAGS.allPackages);
    return ok(created);
  } catch (error) {
    return mapPackageError(error);
  }
}

export async function updatePackageAction(input: unknown): Promise<ActionResult<PackageAdmin>> {
  const parsed = updatePackageSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const current = await readPackageForStaff(parsed.data.id);
    if (!current) return fail('NOT_FOUND');
    const refused = refusedChange(guard.ctx, current, parsed.data);
    if (refused) return refused;
    const saved = await updatePackage(guard.ctx, current, parsed.data);
    revalidateTag(TAGS.allPackages);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapPackageError(error);
  }
}

// Archive by status, never delete: bookings keep pointing at the package (decision of 2026-10-16).
export async function archivePackageAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const current = await readPackageForStaff(parsed.data.id);
    if (!current) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, current.rwId)) {
      return fail('FORBIDDEN', undefined, current.rwId === null ? text.comboReadOnly : undefined);
    }
    await archivePackage(guard.ctx, current.id);
    revalidateTag(TAGS.allPackages);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
