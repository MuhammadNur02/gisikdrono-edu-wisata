import { z } from 'zod';

import { copy } from '@/lib/copy/id';

// The staff sign-in forms, shared by the browser and the Server Actions of src/server/actions/auth.ts.

const EMAIL_MAX_LENGTH = 254;
// bcrypt reads 72 bytes, and Supabase Auth refuses a longer password.
const PASSWORD_MAX_LENGTH = 72;
// docs/Security.md §5.2 (AUTH-02); Supabase Auth checks the same rule and leaked passwords on top.
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
const CAPTCHA_TOKEN_MAX_LENGTH = 2048;
const NEXT_PATH_MAX_LENGTH = 512;
const TOTP_CODE = /^\d{6}$/;

const messages = copy.auth.validation;

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email(messages.email).max(EMAIL_MAX_LENGTH, messages.email));

export const captchaTokenField = z
  .string()
  .min(1, messages.captcha)
  .max(CAPTCHA_TOKEN_MAX_LENGTH, messages.captcha);

// Where to go once the staff member is in; safeRedirect() still decides whether it is allowed.
export const nextField = z.string().max(NEXT_PATH_MAX_LENGTH).optional();

export const totpCodeField = z.string().trim().regex(TOTP_CODE, messages.totpCode);

const newPasswordField = z
  .string()
  .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong)
  .refine(
    (password) =>
      password.length >= PASSWORD_MIN_LENGTH &&
      PASSWORD_CLASSES.every((pattern) => pattern.test(password)),
    messages.newPassword,
  );

export const signInSchema = z
  .object({
    email: emailField,
    password: z
      .string()
      .min(1, messages.password)
      .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong),
    captchaToken: captchaTokenField,
    next: nextField,
  })
  .strict();

export type SignInInput = z.input<typeof signInSchema>;

export const forgotPasswordSchema = z
  .object({ email: emailField, captchaToken: captchaTokenField })
  .strict();

export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

// The TOTP code is required whenever the account has a verified factor: Supabase Auth changes a password only
// at AAL2 then, and the reset link alone opens AAL1.
export const resetPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
    totpCode: totpCodeField.optional(),
    captchaToken: captchaTokenField,
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ['confirmPassword'],
    message: messages.passwordMismatch,
  });

export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
