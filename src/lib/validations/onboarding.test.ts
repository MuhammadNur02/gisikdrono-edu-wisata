import { describe, expect, it } from 'vitest';

import { claimInviteSchema, completeOnboardingSchema } from '@/lib/validations/onboarding';

const COMPLETE = {
  inviteCode: 'ABCDEFGHJKMNPQRSTVWX',
  totpCode: '123456',
  password: 'Petugas-baru-2026!',
  confirmPassword: 'Petugas-baru-2026!',
};

describe('claimInviteSchema', () => {
  it.each(['ABCDE-FGHJK-MNPQR-STVWX', 'abcde fghjk mnpqr stvwx', 'ABCDEFGHJKMNPQRSTVWX'])(
    'takes the code as people copy it: %s',
    (inviteCode) => {
      expect(claimInviteSchema.safeParse({ inviteCode }).success).toBe(true);
    },
  );

  it.each([
    'ABCDEFGHJKMNPQRSTVW',
    'ABCDEFGHJKMNPQRSTVWXY',
    'ABCDEFGHJKMNPQRSTVW!',
    'U'.repeat(20),
    'A'.repeat(65),
  ])('refuses a code of another shape: %s', (inviteCode) => {
    expect(claimInviteSchema.safeParse({ inviteCode }).success).toBe(false);
  });

  it('refuses fields it does not know', () => {
    expect(
      claimInviteSchema.safeParse({ inviteCode: COMPLETE.inviteCode, role: 'superadmin' }).success,
    ).toBe(false);
  });
});

describe('completeOnboardingSchema', () => {
  it('takes the code, a TOTP code and a strong password typed twice', () => {
    expect(completeOnboardingSchema.safeParse(COMPLETE).success).toBe(true);
  });

  it.each([
    ['a weak password', { password: 'pendek', confirmPassword: 'pendek' }],
    ['two different passwords', { confirmPassword: 'Petugas-lain-2026!' }],
    ['a TOTP code of five digits', { totpCode: '12345' }],
    ['an extra field', { rwId: 5 }],
  ])('refuses %s', (_case, change) => {
    expect(completeOnboardingSchema.safeParse({ ...COMPLETE, ...change }).success).toBe(false);
  });
});
