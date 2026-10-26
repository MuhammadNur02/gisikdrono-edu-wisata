import { z } from 'zod';

import { BANK_ACCOUNT_LIMITS, BANK_ACCOUNT_NUMBER } from '@/config/bank-accounts';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import { totpCodeField } from '@/lib/validations/auth';
import { rwIdSchema } from '@/lib/validations/rw-unit';

// Task P4.3.06: the account a superadmin reads, reveals or sets, for a UMKM vendor or an RW treasury. The same limits
// as internal.require_bank_account and record_bank_reveal (20261104120000), checked here first for the form.

const messages = bankAccountsCopy.validation;
const limits = BANK_ACCOUNT_LIMITS;

export const bankAccountTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('vendor'), vendorId: z.uuid() }).strict(),
  z.object({ kind: z.literal('rw'), rwId: rwIdSchema }).strict(),
]);

export const readBankAccountSchema = z.object({ target: bankAccountTargetSchema }).strict();

export const revealBankAccountSchema = z
  .object({
    target: bankAccountTargetSchema,
    reason: z
      .string()
      .trim()
      .min(limits.revealReason.min, messages.reason)
      .max(limits.revealReason.max, messages.reason),
  })
  .strict();

export const setBankAccountSchema = z
  .object({
    target: bankAccountTargetSchema,
    bankName: z
      .string()
      .trim()
      .min(limits.bankName.min, messages.bankName)
      .max(limits.bankName.max, messages.bankName),
    accountNumber: z.string().trim().regex(BANK_ACCOUNT_NUMBER, messages.accountNumber),
    accountHolder: z
      .string()
      .trim()
      .min(limits.accountHolder.min, messages.accountHolder)
      .max(limits.accountHolder.max, messages.accountHolder),
  })
  .strict();

// The forms carry the authenticator code that withStepUp checks first (docs/Security.md §5.3).
export const revealBankAccountFormSchema = revealBankAccountSchema.extend({ code: totpCodeField });
export const setBankAccountFormSchema = setBankAccountSchema.extend({ code: totpCodeField });

export type BankAccountTarget = z.infer<typeof bankAccountTargetSchema>;
export type RevealBankAccountValues = z.infer<typeof revealBankAccountSchema>;
export type SetBankAccountValues = z.infer<typeof setBankAccountSchema>;
