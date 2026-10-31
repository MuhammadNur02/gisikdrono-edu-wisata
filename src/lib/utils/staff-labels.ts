import { rwLabel, type RwId } from '@/config/rw';
import type { AppRole } from '@/db/enums';
import { copy } from '@/lib/copy/id';

// `Superadmin Kelurahan`, `Admin RW 05` or `Admin Kopdes`. rwId is the staff member's own RW: only an RW admin has one
// (profiles_role_rw_ok); the superadmin works for the whole kelurahan and the Kopdes admin for its UMKM.
export function staffRoleLabel(role: Exclude<AppRole, 'none'>, rwId: RwId | null): string {
  const roles = copy.dashboard.roles;
  if (role === 'admin_kopdes') return roles.adminKopdes;
  return role === 'admin_rw' && rwId !== null ? roles.adminRw(rwLabel(rwId)) : roles.superadmin;
}
