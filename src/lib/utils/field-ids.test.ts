import { describe, expect, it } from 'vitest';

import { fieldLabelId } from './field-ids';

describe('fieldLabelId', () => {
  it('derives the label id from the control id FormControl sets', () => {
    expect(fieldLabelId('_r_1_-form-item')).toBe('_r_1_-form-item-label');
  });
});
