import { z } from 'zod';

import { captchaTokenField, nextField, totpCodeField } from '@/lib/validations/auth';

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
