'use server';

import { revalidatePath } from 'next/cache';

import { RW_TREASURIES_PATH } from '@/config/bank-accounts';
import { STAFF_STEP_UP_MAX_AGE_SECONDS, UMKM_MANAGER_ROLES } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { fail, mapError, ok } from '@/lib/errors';
import {
  readBankAccountSchema,
  revealBankAccountSchema,
  setBankAccountSchema,
  type BankAccountTarget,
} from '@/lib/validations/bank-account';
import { requireFreshTotp, requireRole, type StaffRole } from '@/server/auth/guards';
import {
  getMaskedBankAccount,
  revealBankAccountNumber,
  setBankAccount,
} from '@/server/services/bank-account-service';
import type { ActionResult } from '@/types/action-result';
import type { MaskedBankAccount } from '@/types/bank-account';

// Task P4.3.06: the bank accounts of UMKM vendors (the vendors sheet) and RW treasuries (/dashboard/settings). The
// masked view at AAL2; the number and a change with a fresh authenticator code, which the RPCs check again. The number
// goes back to the form that asked and is kept nowhere else.

const SUPERADMIN_ONLY = ['superadmin'] as const satisfies readonly StaffRole[];

// Whose an account is: a seller's belongs to the UMKM managers, the Kopdes running the UMKM finance (docs/PRD.md §13.1
// A30, require_vendor_bank_manager), an RW treasury's to the superadmin alone (require_bank_superadmin).
function ownersOf(target: BankAccountTarget): readonly [StaffRole, ...StaffRole[]] {
  return target.kind === 'vendor' ? UMKM_MANAGER_ROLES : SUPERADMIN_ONLY;
}

export async function loadBankAccountAction(
  input: unknown,
): Promise<ActionResult<MaskedBankAccount>> {
  const parsed = readBankAccountSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole(...ownersOf(parsed.data.target));
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    return ok(await getMaskedBankAccount(parsed.data.target));
  } catch (error) {
    return mapError(error);
  }
}

export async function revealBankAccountAction(
  input: unknown,
): Promise<ActionResult<string | null>> {
  const parsed = revealBankAccountSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const owners = ownersOf(parsed.data.target);
  const owner = await requireRole(...owners);
  if (!owner.ok) return owner;
  const guard = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS, owners);
  if (!guard.ok) return fail('FORBIDDEN', undefined, staffCopy.notFresh);

  try {
    return ok(await revealBankAccountNumber(parsed.data));
  } catch (error) {
    return mapError(error);
  }
}

export async function setBankAccountAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = setBankAccountSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const owners = ownersOf(parsed.data.target);
  const owner = await requireRole(...owners);
  if (!owner.ok) return owner;
  const guard = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS, owners);
  if (!guard.ok) return fail('FORBIDDEN', undefined, staffCopy.notFresh);

  try {
    await setBankAccount(parsed.data);
    if (parsed.data.target.kind === 'rw') revalidatePath(RW_TREASURIES_PATH);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
