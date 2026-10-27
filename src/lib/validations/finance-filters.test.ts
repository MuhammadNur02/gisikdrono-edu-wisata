import { describe, expect, it } from 'vitest';

import { parseAdjustmentFilter, parseDayFilter } from './finance-filters';

describe('the list filters (review of PR #80, L-5)', () => {
  it('reads a status and two days, and leaves out what the URL got wrong', () => {
    expect(
      parseAdjustmentFilter({ status: 'approved', from: '2026-09-01', to: 'kemarin' }),
    ).toEqual({
      status: 'approved',
      from: '2026-09-01',
      to: null,
    });
    expect(parseAdjustmentFilter({ status: 'lain' }).status).toBeNull();
    expect(parseDayFilter({ from: ['2026-09-01', '2026-09-02'] })).toEqual({
      from: '2026-09-01',
      to: null,
    });
  });
});
