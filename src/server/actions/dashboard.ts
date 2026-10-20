'use server';

import { cookies } from 'next/headers';

import { AUTH_COOKIE_OPTIONS, DASHBOARD_PATH } from '@/config/auth';
import { RW_SCOPE_COOKIE, RW_SCOPE_MAX_AGE_SECONDS } from '@/config/dashboard';
import { fail, mapError, ok } from '@/lib/errors';
import { rwScopeSchema } from '@/lib/validations/dashboard';
import { requireRole } from '@/server/auth/guards';
import type { ActionResult } from '@/types/action-result';

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
    (await cookies()).set(RW_SCOPE_COOKIE, String(parsed.data.scope), {
      ...AUTH_COOKIE_OPTIONS,
      path: DASHBOARD_PATH,
      maxAge: RW_SCOPE_MAX_AGE_SECONDS,
    });
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
