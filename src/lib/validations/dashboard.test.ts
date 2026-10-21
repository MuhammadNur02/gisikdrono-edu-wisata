import { describe, expect, it } from 'vitest';

import { rwScopeSchema, updateProfileSchema } from '@/lib/validations/dashboard';

describe('rwScopeSchema', () => {
  it('takes every RW or one RW number', () => {
    expect(rwScopeSchema.safeParse({ scope: 'all' }).success).toBe(true);
    expect(rwScopeSchema.safeParse({ scope: 8 }).success).toBe(true);
    expect(rwScopeSchema.safeParse({ scope: 13 }).success).toBe(true);
    expect(rwScopeSchema.safeParse({ scope: 0 }).success).toBe(false);
    expect(rwScopeSchema.safeParse({ scope: 100 }).success).toBe(false);
    expect(rwScopeSchema.safeParse({ scope: 5.5 }).success).toBe(false);
    expect(rwScopeSchema.safeParse({ scope: '5' }).success).toBe(false);
    expect(rwScopeSchema.safeParse({ scope: 5, rwId: 8 }).success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('trims a name and lets an academic title through', () => {
    expect(updateProfileSchema.parse({ fullName: '  Siti Aminah, S.Pd. ' })).toEqual({
      fullName: 'Siti Aminah, S.Pd.',
    });
  });

  it('refuses an empty name, a link, a phone number and extra fields', () => {
    expect(updateProfileSchema.safeParse({ fullName: '   ' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ fullName: 'Budi www.bayar.top' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ fullName: 'Budi 0812 3456 7890' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ fullName: 'Budi', role: 'superadmin' }).success).toBe(
      false,
    );
  });
});
