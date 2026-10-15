import { describe, expect, it } from 'vitest';

import { escapeLike } from '@/lib/utils/escape-like';

describe('escapeLike', () => {
  it('escapes the ilike wildcards and the escape character itself', () => {
    expect(escapeLike('100%_off\\now')).toBe('100\\%\\_off\\\\now');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLike('SD Negeri 01')).toBe('SD Negeri 01');
  });
});
