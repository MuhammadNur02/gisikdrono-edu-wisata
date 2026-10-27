import 'server-only';

import { STAFF_STEP_UP_MAX_AGE_SECONDS } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { fail } from '@/lib/errors';
import { requireFreshTotp, type GuardResult } from '@/server/auth/guards';

// The finance pages' step-up (Task P4.7; docs/Security.md §5.3, AUTH-11): money moves only with a TOTP code verified in
// the last five minutes, which the finance RPCs check again in the database. The actions call requireRole('superadmin')
// before it; a stale code reads as the step-up to repeat.
export async function requireFinanceStepUp(): Promise<GuardResult> {
  const fresh = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS);
  return fresh.ok ? fresh : fail('FORBIDDEN', undefined, staffCopy.notFresh);
}
