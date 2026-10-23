import { describe, expect, it } from 'vitest';

import { rowFieldName } from './form-paths';

describe('rowFieldName', () => {
  it('names a field of a field-array row as react-hook-form does', () => {
    expect(rowFieldName('priceTiers', 0, 'minPax')).toBe('priceTiers.0.minPax');
    expect(rowFieldName('legs', 12, 'rwId')).toBe('legs.12.rwId');
  });
});
