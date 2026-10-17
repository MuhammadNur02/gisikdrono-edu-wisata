import { describe, expect, it } from 'vitest';

import { isPathUnder } from './paths';

describe('isPathUnder', () => {
  it('matches the prefix and the pages below it', () => {
    expect(isPathUnder('/pesan', '/pesan')).toBe(true);
    expect(isPathUnder('/pesan/eduwisata-ecowastreme', '/pesan')).toBe(true);
  });

  it('does not match a longer word that starts the same way', () => {
    expect(isPathUnder('/pesanan', '/pesan')).toBe(false);
    expect(isPathUnder('/', '/pesan')).toBe(false);
  });
});
