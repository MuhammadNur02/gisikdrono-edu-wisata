import { RW_SCOPE_ALL, type RwScope } from '@/config/dashboard';
import { RW_ID_MAX, RW_ID_MIN } from '@/config/rw';

const RW_SCOPE_PATTERN = /^\d{1,2}$/;

// The rw_scope cookie as the superadmin's RwSwitcher wrote it: an RW number; anything else reads as every RW. Whether
// that RW exists is for the reads to find out, which RLS narrows anyway.
export function parseRwScope(value: string | undefined): RwScope {
  if (value === undefined || !RW_SCOPE_PATTERN.test(value)) return RW_SCOPE_ALL;
  const rwId = Number(value);
  return rwId >= RW_ID_MIN && rwId <= RW_ID_MAX ? rwId : RW_SCOPE_ALL;
}
