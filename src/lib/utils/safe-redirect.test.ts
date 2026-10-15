import { describe, expect, it } from 'vitest';

import { safeRedirect } from '@/lib/utils/safe-redirect';

describe('safeRedirect', () => {
  it('keeps paths on this site, including query and hash', () => {
    expect(safeRedirect('/dashboard/bookings?status=paid#top')).toBe(
      '/dashboard/bookings?status=paid#top',
    );
    expect(safeRedirect('/')).toBe('/');
  });

  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '\\\\evil.test',
    'javascript:alert(1)',
    'dashboard',
    '/\t/evil.test',
    '/\n/evil.test',
    '/ /evil.test',
  ])('falls back for %j', (target) => {
    expect(safeRedirect(target)).toBe('/');
  });

  it('falls back when there is no target, using the given fallback', () => {
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(undefined, '/dashboard')).toBe('/dashboard');
    expect(safeRedirect('', '/dashboard')).toBe('/dashboard');
  });
});
