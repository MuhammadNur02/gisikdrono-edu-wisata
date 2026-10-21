import { rwLabel, type RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';

// `Superadmin Kelurahan` or `Admin RW 05`. rwId is the staff member's own RW, null for the superadmin, who works for the
// whole kelurahan (profiles_role_rw_ok: only admin_rw has an RW).
export function staffRoleLabel(rwId: RwId | null): string {
  const roles = copy.dashboard.roles;
  return rwId === null ? roles.superadmin : roles.adminRw(rwLabel(rwId));
}
