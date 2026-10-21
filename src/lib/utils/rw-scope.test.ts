import { describe, expect, it } from 'vitest';

import { parseRwScope } from '@/lib/utils/rw-scope';

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
