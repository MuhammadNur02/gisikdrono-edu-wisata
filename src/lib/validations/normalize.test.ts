import { describe, expect, it } from 'vitest';

import { normalizeEmail, normalizeMobilePhone } from '@/lib/validations/normalize';

describe('normalizeEmail', () => {
  it('lower-cases and trims every address', () => {
    expect(normalizeEmail('  Admin.RW05@Gisikdrono.Go.Id ')).toBe('admin.rw05@gisikdrono.go.id');
  });

  it('drops the dots and the plus tag of a Gmail mailbox', () => {
    expect(normalizeEmail('A.Budi+promo@Gmail.com')).toBe('abudi@gmail.com');
    expect(normalizeEmail('a.budi@googlemail.com')).toBe('abudi@gmail.com');
  });

  it('keeps dots and plus tags at other providers, where they can be a different mailbox', () => {
    expect(normalizeEmail('a.budi+promo@sekolah.sch.id')).toBe('a.budi+promo@sekolah.sch.id');
  });

  it('leaves something that is not an address alone, for the schema to refuse', () => {
    expect(normalizeEmail('@gmail.com')).toBe('@gmail.com');
    expect(normalizeEmail('no-at-sign')).toBe('no-at-sign');
  });
});

describe('normalizeMobilePhone', () => {
  it('returns the E.164 form of an Indonesian mobile number', () => {
    expect(normalizeMobilePhone('0812-3456-7890')).toBe('+6281234567890');
    expect(normalizeMobilePhone('+62 812 3456 7890')).toBe('+6281234567890');
  });

  it('refuses landlines and numbers from other countries', () => {
    expect(normalizeMobilePhone('024 7612345')).toBeNull();
    expect(normalizeMobilePhone('+60 12 345 6789')).toBeNull();
  });
});
