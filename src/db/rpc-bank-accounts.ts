import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { BankAccountTarget } from '@/lib/validations/bank-account';

// The superadmin's bank account RPCs (Task P4.3.06, 20261104120000_bank_account_rpcs.sql) on the session client, so
// their role, AAL2 and fresh-code checks see who asks. A read answers the number masked; with p_reveal it also answers
// the number, after recording the reason and spending one of the day's 20 reveals.

const accountSchema = z.object({
  bank_name: z.string().nullable(),
  account_holder: z.string().nullable(),
  account_masked: z.string().nullable(),
  account_number: z.string().nullable(),
});

export type BankAccountRow = z.infer<typeof accountSchema>;

export interface BankAccountRead {
  reveal: boolean;
  reason: string | null;
}

export interface BankAccountWrite {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export async function rpcGetBankAccount(
  client: DatabaseClient,
  target: BankAccountTarget,
  read: BankAccountRead,
): Promise<BankAccountRow> {
  const options = {
    p_reveal: read.reveal,
    ...(read.reason === null ? {} : { p_reason: read.reason }),
  };
  const answer =
    target.kind === 'vendor'
      ? await resultOf(
          client.rpc('get_vendor_bank_account', { p_vendor_id: target.vendorId, ...options }),
        )
      : await resultOf(client.rpc('get_rw_treasury_account', { p_rw_id: target.rwId, ...options }));
  return accountSchema.parse(answer);
}

export function rpcSetBankAccount(
  client: DatabaseClient,
  target: BankAccountTarget,
  account: BankAccountWrite,
): Promise<void> {
  const fields = {
    p_bank_name: account.bankName,
    p_account_number: account.accountNumber,
    p_account_holder: account.accountHolder,
  };
  return target.kind === 'vendor'
    ? resultOf(client.rpc('set_vendor_bank_account', { p_vendor_id: target.vendorId, ...fields }))
    : resultOf(client.rpc('set_rw_treasury_account', { p_rw_id: target.rwId, ...fields }));
}
