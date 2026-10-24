'use server';

import { revalidateTag } from 'next/cache';

import type { RwId } from '@/config/rw';
import { sessionsCopy } from '@/lib/copy/sessions';
import { fail, mapError, ok } from '@/lib/errors';
import { TAGS } from '@/lib/queries/tags';
import { jakartaMonthKey, todayInJakarta } from '@/lib/utils/dates';
import { isGeneratableMonth } from '@/lib/utils/sessions';
import { rowRefSchema } from '@/lib/validations/content';
import {
  createSessionTemplateSchema,
  createVisitSessionSchema,
  generateSessionsSchema,
  updateSessionTemplateSchema,
  updateVisitSessionSchema,
} from '@/lib/validations/session';
import { canWriteFor, requireRwContentOwner } from '@/server/auth/content-owner';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createSessionTemplate,
  createVisitSession,
  generateSessionsForMonth,
  readSessionOwner,
  readTemplateOwner,
  removeSessionTemplate,
  removeVisitSession,
  updateSessionTemplate,
  updateVisitSession,
} from '@/server/services/session-service';
import type { ActionFailure, ActionResult } from '@/types/action-result';
import type { SessionTemplateAdmin, VisitSessionAdmin } from '@/types/session';

// /dashboard/sessions (Task P4.3.04, docs/PRD.md FR-ADMIN-03, REC-15, BOOK-13): an RW admin plans their own RW's
// sessions, the superadmin those of the RW their RwSwitcher points at. An existing row is checked against the RW the
// database holds for it, and RLS checks the same again.

const text = sessionsCopy.errors;
const INVALID_PARAMETER = '22023';

type RwResult = { ok: true; rwId: RwId } | ActionFailure;

function existingRw(ctx: StaffContext, owner: RwId | undefined): RwResult {
  if (owner === undefined) return fail('NOT_FOUND');
  return canWriteFor(ctx, owner) ? { ok: true, rwId: owner } : fail('FORBIDDEN');
}

// visit_sessions_guard refuses, with STATE_INVALID, a change a session with bookings cannot take; the unique key
// refuses a second session or pattern at the same start. Both are business outcomes with their own words.
async function mapSessionError(error: unknown, duplicateMessage: string): Promise<ActionFailure> {
  const failure = await mapError(error);
  if (failure.error.code === 'STATE_INVALID')
    return fail('STATE_INVALID', undefined, text.hasBookings);
  if (failure.error.code === 'CONFLICT') return fail('CONFLICT', undefined, duplicateMessage);
  return failure;
}

function revalidateMonth(rwId: RwId, sessionDate: string): void {
  revalidateTag(TAGS.sessions(rwId, jakartaMonthKey(sessionDate)));
}

export async function createVisitSessionAction(
  input: unknown,
): Promise<ActionResult<VisitSessionAdmin>> {
  const parsed = createVisitSessionSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = await requireRwContentOwner(guard.ctx);
    if (!target.ok) return target;
    const session = await createVisitSession(target.rwId, guard.ctx.userId, parsed.data);
    revalidateMonth(target.rwId, session.sessionDate);
    return ok(session);
  } catch (error) {
    return mapSessionError(error, text.duplicateTime);
  }
}

export async function updateVisitSessionAction(
  input: unknown,
): Promise<ActionResult<VisitSessionAdmin>> {
  const parsed = updateVisitSessionSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = existingRw(guard.ctx, await readSessionOwner(parsed.data.id));
    if (!target.ok) return target;
    const session = await updateVisitSession(target.rwId, parsed.data);
    revalidateMonth(target.rwId, session.sessionDate);
    return ok(session);
  } catch (error) {
    return mapSessionError(error, text.duplicateTime);
  }
}

export async function removeVisitSessionAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = existingRw(guard.ctx, await readSessionOwner(parsed.data.id));
    if (!target.ok) return target;
    await removeVisitSession(target.rwId, parsed.data.id);
    // The month is not known once the row is gone; every month of this RW is read fresh by the dashboard anyway,
    // and the public availability view is uncached (src/lib/queries/sessions.ts).
    return ok(null);
  } catch (error) {
    return mapSessionError(error, text.duplicateTime);
  }
}

export async function createSessionTemplateAction(
  input: unknown,
): Promise<ActionResult<SessionTemplateAdmin>> {
  const parsed = createSessionTemplateSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = await requireRwContentOwner(guard.ctx);
    if (!target.ok) return target;
    return ok(await createSessionTemplate(target.rwId, parsed.data));
  } catch (error) {
    return mapSessionError(error, text.duplicateTemplate);
  }
}

export async function updateSessionTemplateAction(
  input: unknown,
): Promise<ActionResult<SessionTemplateAdmin>> {
  const parsed = updateSessionTemplateSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = existingRw(guard.ctx, await readTemplateOwner(parsed.data.id));
    if (!target.ok) return target;
    return ok(await updateSessionTemplate(target.rwId, parsed.data));
  } catch (error) {
    return mapSessionError(error, text.duplicateTemplate);
  }
}

export async function removeSessionTemplateAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rowRefSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    const target = existingRw(guard.ctx, await readTemplateOwner(parsed.data.id));
    if (!target.ok) return target;
    await removeSessionTemplate(target.rwId, parsed.data.id);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// `Buat sesi`: fills the month from the weekly pattern and answers how many sessions it created.
export async function generateVisitSessionsAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = generateSessionsSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  const { month } = parsed.data;
  if (!isGeneratableMonth(month, todayInJakarta())) return refusedMonth();

  try {
    const target = await requireRwContentOwner(guard.ctx);
    if (!target.ok) return target;
    const created = await generateSessionsForMonth(target.rwId, month);
    revalidateTag(TAGS.sessions(target.rwId, month));
    return ok(created);
  } catch (error) {
    return isInvalidParameter(error) ? refusedMonth() : mapError(error);
  }
}

function refusedMonth(): ActionFailure {
  return fail('VALIDATION', { month: [text.generateRange] }, text.generateRange);
}

// generate_visit_sessions raises 22023 for a range past a year ahead; the check above says the same first.
function isInvalidParameter(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === INVALID_PARAMETER
  );
}
