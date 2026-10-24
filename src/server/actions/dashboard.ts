'use server';

import { cookies } from 'next/headers';

import { AUTH_COOKIE_OPTIONS, DASHBOARD_PATH } from '@/config/auth';
import { RW_SCOPE_ALL, RW_SCOPE_COOKIE, RW_SCOPE_MAX_AGE_SECONDS } from '@/config/dashboard';
import { fail, mapError, ok } from '@/lib/errors';
import { rwScopeSchema } from '@/lib/validations/dashboard';
import { readRwScope } from '@/server/auth/content-owner';
import { requireRole, type StaffContext } from '@/server/auth/guards';
import { countCheckInsToday } from '@/server/services/dashboard-stats-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ActionResult } from '@/types/action-result';

// Task P4.2.02: today's gate count, which the overview re-reads every 15 s through the server, never through the
// browser client (CLAUDE.md §5.1). Read-only, so there is no input to validate and nothing to revalidate. An RW
// officer counts their own RW whatever the cookie says; the superadmin, the RW of their switcher; RLS on
// v_attendance_today holds the same line.
export async function readCheckInsTodayAction(): Promise<ActionResult<number | null>> {
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    const rw = await checkInScope(guard.ctx);
    if (rw === undefined) return fail('FORBIDDEN');
    return ok(await countCheckInsToday(rw));
  } catch (error) {
    return mapError(error);
  }
}

// undefined: an RW officer without an RW, who may count nothing.
async function checkInScope(ctx: StaffContext): Promise<number | null | undefined> {
  if (ctx.role === 'admin_rw') return ctx.rwId ?? undefined;
  const scope = await readRwScope();
  return scope === RW_SCOPE_ALL ? null : scope;
}

// docs/StyleGuide.md §6.1: the superadmin's RwSwitcher. It only remembers a filter for lists and KPIs; what a query
// may return is still decided by RLS and the guards, so an RW officer neither sees the switcher nor gains anything
// from writing the cookie by hand.
export async function setRwScopeAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = rwScopeSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    const { scope } = parsed.data;
    // Only an RW of rw_units, which is what the switcher offers.
    if (
      scope !== RW_SCOPE_ALL &&
      !(await listRwUnitsForStaff()).some((unit) => unit.id === scope)
    ) {
      return fail('VALIDATION');
    }
    (await cookies()).set(RW_SCOPE_COOKIE, String(scope), {
      ...AUTH_COOKIE_OPTIONS,
      path: DASHBOARD_PATH,
      maxAge: RW_SCOPE_MAX_AGE_SECONDS,
    });
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
