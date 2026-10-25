import { describe, expect, it } from 'vitest';

import { visitDateFilterOf } from '@/lib/utils/booking-list';

describe('visitDateFilterOf', () => {
  it('keeps a real calendar day and drops anything else', () => {
    expect(visitDateFilterOf('2026-11-06')).toBe('2026-11-06');
    expect(visitDateFilterOf('2026-02-30')).toBeNull();
    expect(visitDateFilterOf('6 November')).toBeNull();
    expect(visitDateFilterOf(null)).toBeNull();
  });
});
