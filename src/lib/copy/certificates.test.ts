import { describe, expect, it } from 'vitest';

import { joinIndonesian } from '@/lib/copy/certificates';

describe('joinIndonesian', () => {
  it('names one, two and three RWs as a sentence does', () => {
    expect(joinIndonesian([])).toBe('');
    expect(joinIndonesian(['RW 05'])).toBe('RW 05');
    expect(joinIndonesian(['RW 05', 'RW 13'])).toBe('RW 05 dan RW 13');
    expect(joinIndonesian(['RW 05', 'RW 13', 'RW 08'])).toBe('RW 05, RW 13, dan RW 08');
  });
});
