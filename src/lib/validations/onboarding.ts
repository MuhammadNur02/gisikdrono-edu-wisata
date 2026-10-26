import { z } from 'zod';

import { INVITE_CODE_LENGTH } from '@/config/staff';
import { copy } from '@/lib/copy/id';
import { CROCKFORD_ALPHABET, normalizeStaffCode } from '@/lib/utils/staff-code-format';
import { confirmPasswordField, newPasswordField, totpCodeField } from '@/lib/validations/auth';

// /onboarding (Task P4.8.01), shared by the form and src/server/actions/onboarding.ts. The code is checked only for
// its shape here; whether it is the invite's is decided in the database from its keyed hash.

// Room for the dashes and spaces of `ABCDE-FGHJK-MNPQR-STVWX` as people copy it.
const INVITE_CODE_INPUT_MAX_LENGTH = 64;

const messages = copy.auth.onboarding.validation;
const CROCKFORD_CODE = new RegExp(`^[${CROCKFORD_ALPHABET}]+$`);

function isInviteCodeShape(input: string): boolean {
  const code = normalizeStaffCode(input);
  return code.length === INVITE_CODE_LENGTH && CROCKFORD_CODE.test(code);
}

export const inviteCodeField = z
  .string()
  .max(INVITE_CODE_INPUT_MAX_LENGTH, messages.inviteCode)
  .refine(isInviteCodeShape, messages.inviteCode);

export const claimInviteSchema = z.object({ inviteCode: inviteCodeField }).strict();

export type ClaimInviteInput = z.input<typeof claimInviteSchema>;

// The code again, because nothing keeps it between the two steps: the claim binds it to this session, and the
// acceptance consumes it.
export const completeOnboardingSchema = z
  .object({
    inviteCode: inviteCodeField,
    totpCode: totpCodeField,
    password: newPasswordField,
    confirmPassword: confirmPasswordField,
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ['confirmPassword'],
    message: copy.auth.validation.passwordMismatch,
  });

export type CompleteOnboardingInput = z.input<typeof completeOnboardingSchema>;
