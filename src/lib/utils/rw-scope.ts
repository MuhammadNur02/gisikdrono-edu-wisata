import { RW_SCOPE_ALL, type RwScope } from '@/config/dashboard';
import { RW_ID_MAX, RW_ID_MIN, type RwId } from '@/config/rw';
import type { AppRole } from '@/db/enums';

const RW_SCOPE_PATTERN = /^\d{1,2}$/;

// The rw_scope cookie as the superadmin's RwSwitcher wrote it: an RW number; anything else reads as every RW. Whether
// that RW exists is for the reads to find out, which RLS narrows anyway.
export function parseRwScope(value: string | undefined): RwScope {
  if (value === undefined || !RW_SCOPE_PATTERN.test(value)) return RW_SCOPE_ALL;
  const rwId = Number(value);
  return rwId >= RW_ID_MIN && rwId <= RW_ID_MAX ? rwId : RW_SCOPE_ALL;
}

export interface RwScopedStaff {
  role: AppRole;
  rwId: RwId | null;
}

// The RW a list is filtered by, with the `?rw=` of the URL tied to who asks (review of PR #31, item 1): an RW admin
// always gets their own RW, whatever the URL says; the superadmin, and the Kopdes admin on its UMKM pages (docs/PRD.md
// §13.1 A30), get the RW they named only when rw_units has it (the same check readRwScope makes), and every RW
// otherwise. RLS narrows the same reads again.
export function effectiveRwFor(
  ctx: RwScopedStaff,
  requested: RwId | null,
  knownRwIds: readonly RwId[],
): RwId | null {
  if (ctx.role === 'admin_rw') return ctx.rwId;
  const seesEveryRw = ctx.role === 'superadmin' || ctx.role === 'admin_kopdes';
  if (!seesEveryRw || requested === null) return null;
  return knownRwIds.includes(requested) ? requested : null;
}
