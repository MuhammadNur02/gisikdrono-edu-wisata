import { describe, expect, it } from 'vitest';

import { formatIDR, formatIDRCompact, formatThousands, parseRupiah } from './currency';

const NBSP = ' ';

describe('formatIDR', () => {
  it('writes Indonesian rupiah with dots and no decimals', () => {
    expect(formatIDR(25000)).toBe(`Rp${NBSP}25.000`);
    expect(formatIDR(2500000)).toBe(`Rp${NBSP}2.500.000`);
    expect(formatIDR(0)).toBe(`Rp${NBSP}0`);
  });

  it('refuses fractions and unsafe numbers', () => {
    expect(() => formatIDR(25000.5)).toThrow(RangeError);
    expect(() => formatIDR(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => formatIDR(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatThousands', () => {
  it('groups digits without the currency sign', () => {
    expect(formatThousands(2500000)).toBe('2.500.000');
    expect(formatThousands(999)).toBe('999');
  });

  it('refuses fractions', () => {
    expect(() => formatThousands(1.5)).toThrow(RangeError);
  });
});

describe('parseRupiah', () => {
  it('reads typed amounts back into whole rupiah', () => {
    expect(parseRupiah(`Rp${NBSP}2.500.000`)).toBe(2500000);
    expect(parseRupiah('25000')).toBe(25000);
    expect(parseRupiah('25.000,-')).toBe(25000);
  });

  it('returns null for an empty field or an amount too large to be money', () => {
    expect(parseRupiah('')).toBeNull();
    expect(parseRupiah('Rp')).toBeNull();
    expect(parseRupiah('9'.repeat(20))).toBeNull();
  });
});

describe('formatIDRCompact', () => {
  it('shortens millions for a chart axis', () => {
    expect(formatIDRCompact(1_250_000)).toBe(`Rp${NBSP}1,3${NBSP}jt`);
    expect(formatIDRCompact(0)).toBe(`Rp${NBSP}0`);
  });

  it('refuses a fraction of a rupiah', () => {
    expect(() => formatIDRCompact(1.5)).toThrow(RangeError);
  });
});
