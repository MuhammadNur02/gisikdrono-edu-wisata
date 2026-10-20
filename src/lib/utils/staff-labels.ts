import { RW_IDS, RW_PROGRAMMES, type RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';

// The RW a staff member works for, as the RW config knows it; null for the superadmin, who works for the whole
// kelurahan (profiles_role_rw_ok: only admin_rw has an RW).
export function staffRwId(rwId: number | null): RwId | null {
  return RW_IDS.find((known) => known === rwId) ?? null;
}

// `Superadmin Kelurahan` or `Admin RW 05`.
export function staffRoleLabel(rwId: RwId | null): string {
  const roles = copy.dashboard.roles;
  return rwId === null ? roles.superadmin : roles.adminRw(RW_PROGRAMMES[rwId].label);
}
