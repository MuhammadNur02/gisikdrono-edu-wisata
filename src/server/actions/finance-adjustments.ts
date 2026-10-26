'use server';

import { revalidatePath } from 'next/cache';

import { ADJUSTMENTS_PATH, FINANCE_PATH } from '@/config/finance';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { fail, mapError, ok } from '@/lib/errors';
import { applyOutcomeOf } from '@/lib/utils/finance-display';
import {
  adjustmentIdSchema,
  bookingLookupSchema,
  proposeAdjustmentSchema,
  rejectAdjustmentSchema,
} from '@/lib/validations/finance';
import { requireFinanceStepUp } from '@/server/auth/finance-guards';
import { requireAal2, requireRole } from '@/server/auth/guards';
import { apply, approve, propose, reject } from '@/server/services/adjustment-service';
import { findFinanceBooking } from '@/server/services/finance-service';
import type { ActionResult } from '@/types/action-result';
import type { AdjustmentReply, AppliedAdjustment, FinanceBooking } from '@/types/finance';

// /dashboard/finance/adjustments (Task P4.7.04; docs/Security.md §3.8, REC-16): finding the booking an adjustment is
// for, then proposing, approving, rejecting (or withdrawing an approval) and applying it. Every write carries the
// authenticator code; the RPCs check it again with the approver's eligibility and the 24-hour delay.

function revalidateAdjustments(): void {
  revalidatePath(ADJUSTMENTS_PATH);
  revalidatePath(FINANCE_PATH);
}

export async function findFinanceBookingAction(
  input: unknown,
): Promise<ActionResult<FinanceBooking>> {
  const parsed = bookingLookupSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const booking = await findFinanceBooking(parsed.data.bookingCode);
    return booking ? ok(booking) : fail('NOT_FOUND', undefined, adjustmentsCopy.lookup.notFound);
  } catch (error) {
    return mapError(error);
  }
}

export async function proposeAdjustmentAction(
  input: unknown,
): Promise<ActionResult<AdjustmentReply>> {
  const parsed = proposeAdjustmentSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    const proposed = await propose(guard.ctx, parsed.data);
    revalidateAdjustments();
    return ok(proposed);
  } catch (error) {
    return mapError(error);
  }
}

export async function approveAdjustmentAction(
  input: unknown,
): Promise<ActionResult<AdjustmentReply>> {
  const parsed = adjustmentIdSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    const approved = await approve(parsed.data.adjustmentId);
    revalidateAdjustments();
    return ok(approved);
  } catch (error) {
    return mapError(error);
  }
}

export async function rejectAdjustmentAction(
  input: unknown,
): Promise<ActionResult<AdjustmentReply>> {
  const parsed = rejectAdjustmentSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    const rejected = await reject(parsed.data.adjustmentId, parsed.data.reason);
    revalidateAdjustments();
    return ok(rejected);
  } catch (error) {
    return mapError(error);
  }
}

// A transfer Midtrans overtook comes back rejected rather than applied (ApplyOutcome 'overtaken'): the database has
// committed that rejection and its alert, so it is a result for the page to explain, not an error.
export async function applyAdjustmentAction(
  input: unknown,
): Promise<ActionResult<AppliedAdjustment>> {
  const parsed = adjustmentIdSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    const applied = await apply(parsed.data.adjustmentId);
    revalidateAdjustments();
    return ok({ ...applied, outcome: applyOutcomeOf(applied.status) });
  } catch (error) {
    return mapError(error);
  }
}
