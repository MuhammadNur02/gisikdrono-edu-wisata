import { RW_SCOPE_ALL, type RwScope } from '@/config/dashboard';
import { RW_IDS } from '@/config/rw';

// The rw_scope cookie as the superadmin's RwSwitcher wrote it; anything else reads as every RW.
export function parseRwScope(value: string | undefined): RwScope {
  return RW_IDS.find((rwId) => String(rwId) === value) ?? RW_SCOPE_ALL;
}
