import { describe, expect, it } from 'vitest';

import { effectiveRwFor, parseRwScope } from '@/lib/utils/rw-scope';

const KNOWN_RWS = [5, 13, 8];

describe('effectiveRwFor', () => {
  it('gives an RW admin their own RW whatever the URL says', () => {
    const officer = { role: 'admin_rw' as const, rwId: 5 };
    expect(effectiveRwFor(officer, 8, KNOWN_RWS)).toBe(5);
    expect(effectiveRwFor(officer, null, KNOWN_RWS)).toBe(5);
  });

  it('lets the superadmin name an RW of rw_units only', () => {
    const superadmin = { role: 'superadmin' as const, rwId: null };
    expect(effectiveRwFor(superadmin, 8, KNOWN_RWS)).toBe(8);
    expect(effectiveRwFor(superadmin, 99, KNOWN_RWS)).toBeNull();
    expect(effectiveRwFor(superadmin, null, KNOWN_RWS)).toBeNull();
  });

  it('gives an account without a role nothing', () => {
    expect(effectiveRwFor({ role: 'none', rwId: null }, 5, KNOWN_RWS)).toBeNull();
  });
});

describe('parseRwScope', () => {
  it('reads an RW number the switcher wrote, whichever RWs exist', () => {
    expect(parseRwScope('5')).toBe(5);
    expect(parseRwScope('8')).toBe(8);
    expect(parseRwScope('13')).toBe(13);
  });

  it('reads anything else as every RW', () => {
    expect(parseRwScope(undefined)).toBe('all');
    expect(parseRwScope('0')).toBe('all');
    expect(parseRwScope('100')).toBe('all');
    expect(parseRwScope('-5')).toBe('all');
    expect(parseRwScope('5; drop')).toBe('all');
    expect(parseRwScope('all')).toBe('all');
  });
});
