import 'server-only';

import { cookies } from 'next/headers';

import { RW_SCOPE_ALL, RW_SCOPE_COOKIE, type RwScope } from '@/config/dashboard';
import type { RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { fail } from '@/lib/errors';
import { parseRwScope } from '@/lib/utils/rw-scope';
import type { StaffContext } from '@/server/auth/guards';
import type { ActionFailure } from '@/types/action-result';
import type { ContentOwner } from '@/types/content';

export type OwnerResult = { ok: true; owner: ContentOwner } | ActionFailure;

export async function readRwScope(): Promise<RwScope> {
  return parseRwScope((await cookies()).get(RW_SCOPE_COOKIE)?.value);
}

// The owner of what a staff member creates. It never comes from a form: an RW admin writes for their own RW
// (app_rw_id, whatever the rw_scope cookie says), the superadmin for the RW their RwSwitcher points at, or for the
// kelurahan under `Semua`. undefined: this account may create nothing.
export function ownerOfNewContent(ctx: StaffContext, scope: RwScope): ContentOwner | undefined {
  if (ctx.role === 'superadmin') return scope === RW_SCOPE_ALL ? null : scope;
  if (ctx.role === 'admin_rw' && ctx.rwId !== null) return ctx.rwId;
  return undefined;
}

// The guard for a row that exists: the owner the database holds against the staff member's own scope. RLS checks the
// same thing again, so a mistake in either one alone still lets nobody write another RW's content.
export function canWriteFor(ctx: StaffContext, owner: ContentOwner): boolean {
  if (ctx.role === 'superadmin') return true;
  return ctx.role === 'admin_rw' && owner !== null && ctx.rwId === owner;
}

// The owner of a new row, for an action. `rwOnly`: the table has no kelurahan rows (activity points, RW pages), so the
// superadmin has to pick an RW in the RwSwitcher first.
export async function requireNewContentOwner(
  ctx: StaffContext,
  options: { rwOnly: boolean },
): Promise<OwnerResult> {
  const owner = ownerOfNewContent(ctx, await readRwScope());
  if (owner === undefined) return fail('FORBIDDEN');
  if (owner === null && options.rwOnly) return fail('STATE_INVALID', undefined, copy.cms.chooseRw);
  return { ok: true, owner };
}

// The RW of what a staff member writes to content that always belongs to one (activity points, RW pages).
export async function requireRwContentOwner(
  ctx: StaffContext,
): Promise<{ ok: true; rwId: RwId } | ActionFailure> {
  const target = await requireNewContentOwner(ctx, { rwOnly: true });
  if (!target.ok) return target;
  return target.owner === null
    ? fail('STATE_INVALID', undefined, copy.cms.chooseRw)
    : { ok: true, rwId: target.owner };
}

// The owners whose rows a list shows: an RW admin's own RW; for the superadmin the RW the RwSwitcher points at, or
// every RW (`allRwIds`, from rw_units) and the kelurahan under Semua. RLS narrows the same reads again.
export function listedOwners(
  ctx: StaffContext,
  scope: RwScope,
  allRwIds: readonly RwId[],
): ContentOwner[] {
  if (ctx.role === 'admin_rw') {
    const own = ownerOfNewContent(ctx, scope);
    return own === undefined ? [] : [own];
  }
  if (ctx.role !== 'superadmin') return [];
  return scope === RW_SCOPE_ALL ? [...allRwIds, null] : [scope];
}

// docs/PRD.md FR-ADMIN-13: the RWs with rw_units.schedule_enabled run a performance schedule, which their admin and
// the superadmin manage.
export function canManageSchedules(ctx: StaffContext, scheduleRwIds: readonly RwId[]): boolean {
  if (ctx.role === 'superadmin') return true;
  return ctx.role === 'admin_rw' && ctx.rwId !== null && scheduleRwIds.includes(ctx.rwId);
}

// The RW whose schedule a staff member works on: an RW admin's own, if it runs one; for the superadmin the one the
// RwSwitcher points at, or under Semua the only one there is. undefined: none to manage here.
export function scheduleRwFor(
  ctx: StaffContext,
  scope: RwScope,
  scheduleRwIds: readonly RwId[],
): RwId | undefined {
  if (ctx.role === 'admin_rw') {
    return ctx.rwId !== null && scheduleRwIds.includes(ctx.rwId) ? ctx.rwId : undefined;
  }
  if (ctx.role !== 'superadmin') return undefined;
  if (scope !== RW_SCOPE_ALL && scheduleRwIds.includes(scope)) return scope;
  const [onlyRw, ...others] = scheduleRwIds;
  return others.length === 0 ? onlyRw : undefined;
}
