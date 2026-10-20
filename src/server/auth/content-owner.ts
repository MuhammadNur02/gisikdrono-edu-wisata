import 'server-only';

import { cookies } from 'next/headers';

import { RW_SCOPE_ALL, RW_SCOPE_COOKIE, type RwScope } from '@/config/dashboard';
import { isRwId } from '@/config/rw';
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
  if (ctx.role === 'admin_rw' && ctx.rwId !== null && isRwId(ctx.rwId)) return ctx.rwId;
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

export function toContentOwner(rwId: number | null): ContentOwner | undefined {
  if (rwId === null) return null;
  return isRwId(rwId) ? rwId : undefined;
}
