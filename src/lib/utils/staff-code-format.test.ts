import { describe, expect, it } from 'vitest';

import { CROCKFORD_ALPHABET, formatStaffCode, normalizeStaffCode } from './staff-code-format';

describe('CROCKFORD_ALPHABET', () => {
  it('has 32 characters and none of I, L, O or U', () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
    expect(new Set(CROCKFORD_ALPHABET).size).toBe(32);
    expect(CROCKFORD_ALPHABET).not.toMatch(/[ILOU]/);
  });
});

describe('normalizeStaffCode', () => {
  it('drops separators and spaces and upper-cases the letters', () => {
    expect(normalizeStaffCode(' abcde-fghjk mnpqr_stvwx ')).toBe('ABCDEFGHJKMNPQRSTVWX');
  });

  it('reads look-alike letters as the digit people meant', () => {
    expect(normalizeStaffCode('o0Il1')).toBe('00111');
  });

  it('leaves a code already in its canonical spelling alone', () => {
    expect(normalizeStaffCode('7F3K9Q2M7F3K9Q2M7F3K')).toBe('7F3K9Q2M7F3K9Q2M7F3K');
  });
});

describe('formatStaffCode', () => {
  it('splits a 20-character code into four groups of five', () => {
    expect(formatStaffCode('ABCDEFGHJKMNPQRSTVWX')).toBe('ABCDE-FGHJK-MNPQR-STVWX');
  });

  it('keeps a short last group and an empty code empty', () => {
    expect(formatStaffCode('ABCDEFG')).toBe('ABCDE-FG');
    expect(formatStaffCode('')).toBe('');
  });

  it('round-trips through normalizeStaffCode', () => {
    expect(normalizeStaffCode(formatStaffCode('ABCDEFGHJKMNPQRSTVWX'))).toBe(
      'ABCDEFGHJKMNPQRSTVWX',
    );
  });
});
