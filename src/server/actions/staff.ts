'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { STAFF_STEP_UP_MAX_AGE_SECONDS, USERS_PATH } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { fail, mapError, ok } from '@/lib/errors';
import { requestIdFrom } from '@/lib/logger';
import {
  cancelPromotionSchema,
  inviteStaffSchema,
  revokeInviteSchema,
  setStaffRoleSchema,
  setStaffStatusSchema,
} from '@/lib/validations/staff';
import { requireFreshTotp, requireRole, type GuardResult } from '@/server/auth/guards';
import {
  cancelStaffPromotion,
  changeStaffRole,
  changeStaffStatus,
  createStaffInvite,
  revokeStaffInvite,
} from '@/server/services/staff-admin-service';
import type { ActionResult } from '@/types/action-result';
import type { IssuedInvite, StaffRoleChange, StaffStatusChange } from '@/types/staff';

// /dashboard/users (Task P4.8.02, docs/Security.md §5.1, §5.3, §5.6). Every change is the superadmin's, at AAL2, with
// a TOTP code verified in the last five minutes through verifyStaffTotpAction, and never on their own row. The staff
// RPCs and the fresh_totp() policies check all of it again in the database. Invite codes are never logged.

async function requireStaffChange(): Promise<GuardResult> {
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const fresh = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS);
  return fresh.ok ? fresh : fail('FORBIDDEN', undefined, staffCopy.notFresh);
}

function refuseOwnRow(
  guard: GuardResult & { ok: true },
  userId: string,
): ActionResult<never> | null {
  return guard.ctx.userId === userId ? fail('FORBIDDEN', undefined, staffCopy.ownRow) : null;
}

export async function inviteStaffAction(input: unknown): Promise<ActionResult<IssuedInvite>> {
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireStaffChange();
  if (!guard.ok) return guard;

  try {
    const issued = await createStaffInvite(guard.ctx, parsed.data);
    revalidatePath(USERS_PATH);
    return ok(issued);
  } catch (error) {
    return mapError(error);
  }
}

export async function revokeStaffInviteAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = revokeInviteSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireStaffChange();
  if (!guard.ok) return guard;

  try {
    await revokeStaffInvite(parsed.data.inviteId);
    revalidatePath(USERS_PATH);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

export async function setStaffRoleAction(input: unknown): Promise<ActionResult<StaffRoleChange>> {
  const parsed = setStaffRoleSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireStaffChange();
  if (!guard.ok) return guard;
  const ownRow = refuseOwnRow(guard, parsed.data.userId);
  if (ownRow) return ownRow;

  try {
    const change = await changeStaffRole(parsed.data);
    revalidatePath(USERS_PATH);
    return ok(change);
  } catch (error) {
    return mapError(error);
  }
}

export async function setStaffStatusAction(
  input: unknown,
): Promise<ActionResult<StaffStatusChange>> {
  const parsed = setStaffStatusSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireStaffChange();
  if (!guard.ok) return guard;
  const ownRow = refuseOwnRow(guard, parsed.data.userId);
  if (ownRow) return ownRow;

  try {
    const change = await changeStaffStatus(parsed.data, requestIdFrom(await headers()));
    revalidatePath(USERS_PATH);
    return ok(change);
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelSuperadminPromotionAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = cancelPromotionSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireStaffChange();
  if (!guard.ok) return guard;

  try {
    await cancelStaffPromotion(parsed.data.userId);
    revalidatePath(USERS_PATH);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
