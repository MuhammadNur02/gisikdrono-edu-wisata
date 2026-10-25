import { describe, expect, it } from 'vitest';

import { joinWithAnd } from '@/lib/utils/lists';

describe('joinWithAnd', () => {
  it('writes nothing for no items and the item alone for one', () => {
    expect(joinWithAnd([])).toBe('');
    expect(joinWithAnd(['RW 05'])).toBe('RW 05');
  });

  it('joins two with dan and three or more with the serial comma', () => {
    expect(joinWithAnd(['RW 05', 'RW 13'])).toBe('RW 05 dan RW 13');
    expect(joinWithAnd(['RW 05', 'RW 13', 'RW 08'])).toBe('RW 05, RW 13, dan RW 08');
  });
});
