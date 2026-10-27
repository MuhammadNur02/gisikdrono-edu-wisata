import { describe, expect, it } from 'vitest';

import { forgotPasswordSchema, resetPasswordSchema, signInSchema } from '@/lib/validations/auth';
import { confirmMfaEnrolmentSchema, verifyMfaSchema } from '@/lib/validations/mfa';

const STRONG = 'Another-Strong-Pass-2!';

describe('signInSchema', () => {
  it('trims and lower-cases the address', () => {
    const parsed = signInSchema.parse({
      email: ' Admin@Gisikdrono.Test ',
      password: 'x',
      captchaToken: 't',
    });

    expect(parsed.email).toBe('admin@gisikdrono.test');
  });

  it('refuses extra fields, a missing token and a password over 72 characters', () => {
    const base = { email: 'a@b.test', password: 'x', captchaToken: 't' };

    expect(signInSchema.safeParse({ ...base, role: 'superadmin' }).success).toBe(false);
    expect(signInSchema.safeParse({ ...base, captchaToken: '' }).success).toBe(false);
    expect(signInSchema.safeParse({ ...base, password: 'x'.repeat(73) }).success).toBe(false);
    expect(signInSchema.safeParse({ ...base, next: '/x'.repeat(300) }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('takes an address and a token only', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.test', captchaToken: 't' }).success).toBe(
      true,
    );
    expect(
      forgotPasswordSchema.safeParse({ email: 'not-an-address', captchaToken: 't' }).success,
    ).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const valid = { password: STRONG, confirmPassword: STRONG, captchaToken: 't' };

  it('accepts 8 or more characters with all four classes, with or without a code', () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ ...valid, totpCode: '123456' }).success).toBe(true);
    const shortest = 'Ab3!efgh';
    expect(
      resetPasswordSchema.safeParse({ ...valid, password: shortest, confirmPassword: shortest })
        .success,
    ).toBe(true);
  });

  it.each([
    ['too short', 'Sh-1!aB'],
    ['no upper case', 'another-strong-pass-2!'],
    ['no digit', 'Another-Strong-Pass!'],
    ['no symbol', 'AnotherStrongPass2'],
  ])('refuses a password with %s', (_case, password) => {
    expect(
      resetPasswordSchema.safeParse({ ...valid, password, confirmPassword: password }).success,
    ).toBe(false);
  });

  it('refuses two passwords that differ and a code that is not six digits', () => {
    expect(
      resetPasswordSchema.safeParse({ ...valid, confirmPassword: 'Different-Pass-3!' }).success,
    ).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...valid, totpCode: '12345a' }).success).toBe(false);
  });
});

describe('MFA schemas', () => {
  it('want six digits, and a factor id that is a uuid', () => {
    expect(verifyMfaSchema.safeParse({ code: ' 123456 ', captchaToken: 't' }).success).toBe(true);
    expect(verifyMfaSchema.safeParse({ code: '1234567', captchaToken: 't' }).success).toBe(false);
    expect(
      confirmMfaEnrolmentSchema.safeParse({ factorId: 'not-a-uuid', code: '123456' }).success,
    ).toBe(false);
  });
});
