'use server';

import { revalidateTag } from 'next/cache';

import { copy } from '@/lib/copy/id';
import { fail, mapError, ok, okUnlessFilesLeft } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { rowRefSchema } from '@/lib/validations/content';
import { createScheduleSchema, updateScheduleSchema } from '@/lib/validations/schedule';
import {
  canManageSchedules,
  canWriteFor,
  readRwScope,
  scheduleRwFor,
} from '@/server/auth/content-owner';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { listScheduleRwIds } from '@/server/services/rw-unit-service';
import {
  archiveSchedule,
  createSchedule,
  readScheduleOwner,
  removeSchedule,
  updateSchedule,
} from '@/server/services/schedule-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { ScheduleAdmin } from '@/types/cms';

// /dashboard/schedules (Task P2.9.05, docs/PRD.md FR-ADMIN-13): the admin of an RW that runs a performance schedule
// (rw_units.schedule_enabled) and the superadmin. An existing schedule is also checked against the RW the database
// holds for it.

type ScheduleRwResult = { ok: true; rwId: number } | ActionFailure;

// The RW a new schedule belongs to: the admin's own, or the one the superadmin's RwSwitcher points at.
async function newScheduleRw(ctx: StaffContext): Promise<ScheduleRwResult> {
  const scheduleRwIds = await listScheduleRwIds();
  if (!canManageSchedules(ctx, scheduleRwIds)) return fail('FORBIDDEN');
  const rwId = scheduleRwFor(ctx, await readRwScope(), scheduleRwIds);
  return rwId === undefined
    ? fail('STATE_INVALID', undefined, copy.cms.chooseRw)
    : { ok: true, rwId };
}

// The RW of a schedule that exists, if this staff member may change it.
async function existingScheduleRw(ctx: StaffContext, id: string): Promise<ScheduleRwResult> {
  if (!canManageSchedules(ctx, await listScheduleRwIds())) return fail('FORBIDDEN');
  const rwId = await readScheduleOwner(id);
  if (rwId === undefined) return fail('NOT_FOUND');
  return canWriteFor(ctx, rwId) ? { ok: true, rwId } : fail('FORBIDDEN');
}

export async function createScheduleAction(input: unknown): Promise<ActionResult<ScheduleAdmin>> {
  const parsed = createScheduleSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = await newScheduleRw(guard.ctx);
    if (!target.ok) return target;
    const schedule = await createSchedule(target.rwId, guard.ctx.userId, parsed.data);
    revalidateTag(TAGS.schedules);
    return ok(schedule);
  } catch (error) {
    return mapError(error);
  }
}

export async function updateScheduleAction(input: unknown): Promise<ActionResult<ScheduleAdmin>> {
  const parsed = updateScheduleSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = await existingScheduleRw(guard.ctx, parsed.data.id);
    if (!target.ok) return target;
    const saved = await updateSchedule(guard.ctx, parsed.data);
    revalidateTag(TAGS.schedules);
    return okUnlessFilesLeft(saved);
  } catch (error) {
    return mapError(error);
  }
}

export async function removeScheduleAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = await existingScheduleRw(guard.ctx, parsed.data.id);
    if (!target.ok) return target;
    const filesRemoved = await removeSchedule(guard.ctx, target.rwId, parsed.data.id);
    revalidateTag(TAGS.schedules);
    return okUnlessFilesLeft({ value: null, filesRemoved });
  } catch (error) {
    return mapError(error);
  }
}

// Archive by status instead of a delete (Task P4.3.03).
export async function archiveScheduleAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = await existingScheduleRw(guard.ctx, parsed.data.id);
    if (!target.ok) return target;
    await archiveSchedule(target.rwId, parsed.data.id);
    revalidateTag(TAGS.schedules);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
