import { describe, expect, it } from 'vitest';

import { pageScale } from './rasterise-pdf';

describe('pageScale', () => {
  it('brings the long edge of a page to 1600 px, portrait or landscape', () => {
    expect(595 * pageScale(420, 595)).toBeCloseTo(1600);
    expect(842 * pageScale(842, 595)).toBeCloseTo(1600);
  });
});
