import { describe, expect, it } from 'vitest';

import {
  normalizeEmail,
  normalizeInternationalPhone,
  normalizeMobilePhone,
} from '@/lib/validations/normalize';

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
  it.each([
    ['0812-3456-7890', '+6281234567890'],
    ['081234567890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['62 857 1234 5678', '+6285712345678'],
    ['+62 812 3456 7890', '+6281234567890'],
    ['+62 (821) 1234-567', '+628211234567'],
  ])('returns the E.164 form of the Indonesian mobile number %s', (input, expected) => {
    expect(normalizeMobilePhone(input)).toBe(expected);
  });

  it.each([
    ['a Semarang landline', '024 7612345'],
    ['a landline written with +62', '+62 24 7612345'],
    ['a Malaysian number', '+60 12 345 6789'],
    ['a number with 0 after the country code', '+62 0812 3456 7890'],
    ['a number too short', '0812 345'],
  ])('refuses %s', (_case, input) => {
    expect(normalizeMobilePhone(input)).toBeNull();
  });
});

// Task P4.3.10: the number an officer enters for a group at the counter.
describe('normalizeInternationalPhone', () => {
  it.each([
    ['an Indonesian mobile number', '0812-3456-7890', '+6281234567890'],
    ['an Indonesian landline', '024 7612345', '+62247612345'],
    ['a British number', '+44 7700 900123', '+447700900123'],
    ['a Malaysian number', '+60 (12) 345-6789', '+60123456789'],
  ])('returns the E.164 form of %s', (_case, input, expected) => {
    expect(normalizeInternationalPhone(input)).toBe(expected);
  });

  it.each([
    ['a foreign number without +', '0044 7700 900123'],
    ['a country code starting with 0', '+0 7700 900123'],
    ['a number too short', '+44 1234'],
    ['a number too long', '+44 1234 5678 9012 34'],
    ['words', 'nomor hotel'],
  ])('refuses %s', (_case, input) => {
    expect(normalizeInternationalPhone(input)).toBeNull();
  });
});
