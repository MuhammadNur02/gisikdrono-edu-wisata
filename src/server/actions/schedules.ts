'use server';

import { revalidateTag } from 'next/cache';

import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { rowRefSchema } from '@/lib/validations/content';
import { createScheduleSchema, updateScheduleSchema } from '@/lib/validations/schedule';
import { canManageSchedules, canWriteFor } from '@/server/auth/content-owner';
import { requireAal2 } from '@/server/auth/guards';
import {
  createSchedule,
  readScheduleOwner,
  removeSchedule,
  updateSchedule,
} from '@/server/services/schedule-service';
import type { ActionResult } from '@/types/action-result';
import type { ScheduleAdmin } from '@/types/cms';

// /dashboard/schedules (Task P2.9.05, docs/PRD.md FR-ADMIN-13): RW 08's admin and the superadmin. An existing
// schedule is also checked against the RW the database holds for it.

export async function createScheduleAction(input: unknown): Promise<ActionResult<ScheduleAdmin>> {
  const parsed = createScheduleSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  if (!canManageSchedules(guard.ctx)) return fail('FORBIDDEN');

  try {
    const schedule = await createSchedule(guard.ctx.userId, parsed.data);
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
  if (!canManageSchedules(guard.ctx)) return fail('FORBIDDEN');

  try {
    const rwId = await readScheduleOwner(parsed.data.id);
    if (rwId === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, rwId)) return fail('FORBIDDEN');
    const schedule = await updateSchedule(parsed.data);
    revalidateTag(TAGS.schedules);
    return ok(schedule);
  } catch (error) {
    return mapError(error);
  }
}

export async function removeScheduleAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  if (!canManageSchedules(guard.ctx)) return fail('FORBIDDEN');

  try {
    const rwId = await readScheduleOwner(parsed.data.id);
    if (rwId === undefined) return fail('NOT_FOUND');
    if (!canWriteFor(guard.ctx, rwId)) return fail('FORBIDDEN');
    await removeSchedule(parsed.data.id);
    revalidateTag(TAGS.schedules);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
