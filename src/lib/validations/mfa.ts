import { z } from 'zod';

import { captchaTokenField, nextField, totpCodeField } from '@/lib/validations/auth';
import { inviteCodeField } from '@/lib/validations/onboarding';

// /mfa/verify and /mfa/enroll (Task P2.8.02), shared by the forms and src/server/actions/mfa.ts.

export const verifyMfaSchema = z
  .object({ code: totpCodeField, captchaToken: captchaTokenField, next: nextField })
  .strict();

export type VerifyMfaInput = z.input<typeof verifyMfaSchema>;

// The factor id comes from the enrolment the same staff member just started; the server checks it is theirs.
export const confirmMfaEnrolmentSchema = z
  .object({ factorId: z.uuid(), code: totpCodeField, next: nextField })
  .strict();

export type ConfirmMfaEnrolmentInput = z.input<typeof confirmMfaEnrolmentSchema>;

// Task P4.8.05: after an MFA reset the new authenticator needs the superadmin's one-time code, which has the shape of
// an invite code (20 Crockford characters); an account with a role needs none.
export const startMfaEnrolmentSchema = z
  .object({ reenrolmentCode: inviteCodeField.optional() })
  .strict();

export type StartMfaEnrolmentInput = z.input<typeof startMfaEnrolmentSchema>;
