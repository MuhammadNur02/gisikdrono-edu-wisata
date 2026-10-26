'use server';

import { revalidatePath } from 'next/cache';

import { bookingDetailPath } from '@/config/bookings';
import { STAFF_STEP_UP_MAX_AGE_SECONDS } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { fail, mapError, ok } from '@/lib/errors';
import {
  closeDsrSchema,
  dsrFinishSchema,
  dsrStepSchema,
  openDsrSchema,
  type DsrFinishValues,
} from '@/lib/validations/dsr';
import { requireFreshTotp, requireRole, type GuardResult } from '@/server/auth/guards';
import {
  acknowledgeDsrRequest,
  anonymiseDsrBooking,
  closeDsrRequest,
  deleteDsrParticipants,
  exportDsrData,
  openDsrRequest,
} from '@/server/services/dsr-service';
import type { ActionResult } from '@/types/action-result';
import type { DsrStepAnswer } from '@/types/dsr';

// The superadmin's data-request queue on /dashboard/bookings/[id] (Task P4.10.03; docs/Security.md §7.6, PDP-03). Each
// step is the superadmin's at AAL2; the steps that delete or hand out personal data need a TOTP code from the last
// five minutes, which the dialog checks through verifyStaffTotpAction first. The dsr_* RPCs check all of it again.

async function requireHandler(): Promise<GuardResult> {
  const guard = await requireRole('superadmin');
  if (!guard.ok) return guard;
  return guard.ctx.isAal2 ? guard : fail('FORBIDDEN');
}

async function requireFreshHandler(): Promise<GuardResult> {
  const guard = await requireHandler();
  if (!guard.ok) return guard;
  const fresh = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS);
  return fresh.ok ? guard : fail('FORBIDDEN', undefined, staffCopy.notFresh);
}

export async function openDsrRequestAction(input: unknown): Promise<ActionResult<DsrStepAnswer>> {
  const parsed = openDsrSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireHandler();
  if (!guard.ok) return guard;

  try {
    const opened = await openDsrRequest(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok(opened);
  } catch (error) {
    return mapError(error);
  }
}

export async function acknowledgeDsrRequestAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = dsrStepSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireHandler();
  if (!guard.ok) return guard;

  try {
    await acknowledgeDsrRequest(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

type FinishStep = (values: DsrFinishValues) => Promise<{ isGuestNotified: boolean }>;

async function finishWith(step: FinishStep, input: unknown): Promise<ActionResult<DsrStepAnswer>> {
  const parsed = dsrFinishSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireFreshHandler();
  if (!guard.ok) return guard;

  try {
    const finished = await step(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok({ isGuestNotified: finished.isGuestNotified });
  } catch (error) {
    return mapError(error);
  }
}

export async function exportDsrDataAction(input: unknown): Promise<ActionResult<DsrStepAnswer>> {
  return finishWith(exportDsrData, input);
}

export async function deleteDsrParticipantsAction(
  input: unknown,
): Promise<ActionResult<DsrStepAnswer>> {
  return finishWith(deleteDsrParticipants, input);
}

export async function anonymiseDsrBookingAction(
  input: unknown,
): Promise<ActionResult<DsrStepAnswer>> {
  return finishWith(anonymiseDsrBooking, input);
}

export async function closeDsrRequestAction(input: unknown): Promise<ActionResult<DsrStepAnswer>> {
  const parsed = closeDsrSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireHandler();
  if (!guard.ok) return guard;

  try {
    const closed = await closeDsrRequest(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok({ isGuestNotified: closed.isGuestNotified });
  } catch (error) {
    return mapError(error);
  }
}
