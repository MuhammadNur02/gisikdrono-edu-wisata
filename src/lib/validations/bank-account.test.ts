import { describe, expect, it } from 'vitest';

import {
  revealBankAccountSchema,
  setBankAccountFormSchema,
  setBankAccountSchema,
} from '@/lib/validations/bank-account';

const ACCOUNT = {
  target: { kind: 'vendor', vendorId: '0192f3a4-5b6c-7d8e-9f01-0000000000dd' },
  bankName: 'BRI',
  accountNumber: '1234567890',
  accountHolder: 'Ibu Sari',
};

describe('the bank account schemas', () => {
  it('take an account of 5 to 20 digits for a vendor or an RW', () => {
    expect(setBankAccountSchema.safeParse(ACCOUNT).success).toBe(true);
    expect(
      setBankAccountSchema.safeParse({ ...ACCOUNT, target: { kind: 'rw', rwId: 5 } }).success,
    ).toBe(true);
    expect(setBankAccountSchema.safeParse({ ...ACCOUNT, accountNumber: '1234' }).success).toBe(
      false,
    );
    expect(setBankAccountSchema.safeParse({ ...ACCOUNT, accountNumber: '1234-5678' }).success).toBe(
      false,
    );
    expect(
      setBankAccountSchema.safeParse({ ...ACCOUNT, accountNumber: '1'.repeat(21) }).success,
    ).toBe(false);
  });

  it('refuse extra fields and a target that is neither', () => {
    expect(setBankAccountSchema.safeParse({ ...ACCOUNT, isVerified: true }).success).toBe(false);
    expect(
      setBankAccountSchema.safeParse({ ...ACCOUNT, target: { kind: 'kelurahan' } }).success,
    ).toBe(false);
  });

  it('need a reason of 3 to 300 characters for a reveal, and a code on the form', () => {
    const target = { kind: 'rw', rwId: 8 };
    expect(revealBankAccountSchema.safeParse({ target, reason: 'ab' }).success).toBe(false);
    expect(revealBankAccountSchema.safeParse({ target, reason: 'x'.repeat(301) }).success).toBe(
      false,
    );
    expect(revealBankAccountSchema.safeParse({ target, reason: 'Cek transfer' }).success).toBe(
      true,
    );
    expect(setBankAccountFormSchema.safeParse(ACCOUNT).success).toBe(false);
  });
});
