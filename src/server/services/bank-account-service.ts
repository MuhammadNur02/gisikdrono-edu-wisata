import 'server-only';

import { rpcGetBankAccount, rpcSetBankAccount, type BankAccountRow } from '@/db/rpc-bank-accounts';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import { staffCopy } from '@/lib/copy/staff';
import { AppError, privilegeHintOf, raisedHintOf } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  BankAccountTarget,
  RevealBankAccountValues,
  SetBankAccountValues,
} from '@/lib/validations/bank-account';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { MaskedBankAccount, RwTreasuryAccount } from '@/types/bank-account';

// Task P4.3.06 (docs/Security.md DATA-04, STAFF-02): the bank accounts of UMKM vendors and RW treasuries, which 0005
// grants to no API role, read and written only through the superadmin's RPCs of 20261104120000 on the session
// client. The masked view needs AAL2; the full number and every change need a fresh authenticator code, and each
// reveal is audited with its reason and capped at 20 a day. The full number is returned to the action that asked and
// kept nowhere.

const INSUFFICIENT_PRIVILEGE = '42501';
const NO_DATA_FOUND = 'P0002';
const INVALID_PARAMETER = '22023';

function codeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

function bankRefusal(error: unknown): AppError | null {
  if (codeOf(error) === INSUFFICIENT_PRIVILEGE) {
    const isStale = privilegeHintOf(error) === 'FRESH_TOTP';
    return new AppError('FORBIDDEN', isStale ? staffCopy.notFresh : undefined);
  }
  if (codeOf(error) === NO_DATA_FOUND) return new AppError('NOT_FOUND');
  if (codeOf(error) === INVALID_PARAMETER) return new AppError('VALIDATION');
  if (raisedHintOf(error) === 'RATE_LIMITED') {
    return new AppError('RATE_LIMITED', bankAccountsCopy.rateLimited);
  }
  return null;
}

async function asBankStep<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw bankRefusal(error) ?? error;
  }
}

function toMasked(row: BankAccountRow): MaskedBankAccount {
  return {
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountMasked: row.account_masked,
  };
}

export async function getMaskedBankAccount(target: BankAccountTarget): Promise<MaskedBankAccount> {
  const supabase = await createSupabaseServerClient();
  const row = await asBankStep(() =>
    rpcGetBankAccount(supabase, target, { reveal: false, reason: null }),
  );
  return toMasked(row);
}

// The full number for this page view, with the superadmin's reason, counted against the day's 20.
export async function revealBankAccountNumber(
  values: RevealBankAccountValues,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const row = await asBankStep(() =>
    rpcGetBankAccount(supabase, values.target, { reveal: true, reason: values.reason }),
  );
  return row.account_number;
}

export async function setBankAccount(values: SetBankAccountValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asBankStep(() =>
    rpcSetBankAccount(supabase, values.target, {
      bankName: values.bankName,
      accountNumber: values.accountNumber,
      accountHolder: values.accountHolder,
    }),
  );
}

// /dashboard/settings: every RW's treasury, masked.
export async function listRwTreasuryAccounts(): Promise<RwTreasuryAccount[]> {
  const units = await listRwUnitsForStaff();
  return Promise.all(
    units.map(async (unit) => ({
      rwId: unit.id,
      rwName: unit.name,
      account: await getMaskedBankAccount({ kind: 'rw', rwId: unit.id }),
    })),
  );
}
