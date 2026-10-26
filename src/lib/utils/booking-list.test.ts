import { describe, expect, it } from 'vitest';

import { firstPageAddress, visitDateFilterOf } from '@/lib/utils/booking-list';

describe('visitDateFilterOf', () => {
  it('keeps a real calendar day and drops anything else', () => {
    expect(visitDateFilterOf('2026-11-06')).toBe('2026-11-06');
    expect(visitDateFilterOf('2026-02-30')).toBeNull();
    expect(visitDateFilterOf('6 November')).toBeNull();
    expect(visitDateFilterOf(null)).toBeNull();
  });
});

describe('firstPageAddress', () => {
  it('keeps every filter but the page', () => {
    expect(
      firstPageAddress('/dashboard/bookings', { page: '4', q: 'SD', status: ['paid', 'quoted'] }),
    ).toBe('/dashboard/bookings?q=SD&status=paid&status=quoted');
    expect(firstPageAddress('/dashboard/bookings', { page: '2', rw: undefined })).toBe(
      '/dashboard/bookings',
    );
  });
});
