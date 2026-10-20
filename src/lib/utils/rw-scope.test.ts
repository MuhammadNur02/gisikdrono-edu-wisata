import { describe, expect, it } from 'vitest';

import { parseRwScope } from '@/lib/utils/rw-scope';

describe('parseRwScope', () => {
  it('reads an RW the switcher wrote', () => {
    expect(parseRwScope('5')).toBe(5);
    expect(parseRwScope('8')).toBe(8);
  });

  it('reads anything else as every RW', () => {
    expect(parseRwScope(undefined)).toBe('all');
    expect(parseRwScope('7')).toBe('all');
    expect(parseRwScope('5; drop')).toBe('all');
  });
});
