import { describe, expect, it } from 'vitest';

import { crossesScannerBoundary } from '@/lib/utils/scanner-boundary';

describe('crossesScannerBoundary', () => {
  it('needs a document load into the scanner and out of it', () => {
    expect(crossesScannerBoundary('/dashboard', '/dashboard/scanner')).toBe(true);
    expect(crossesScannerBoundary('/dashboard/bookings', '/dashboard/scanner/')).toBe(true);
    expect(crossesScannerBoundary('/dashboard/scanner', '/dashboard')).toBe(true);
    expect(crossesScannerBoundary('/dashboard/scanner', '/login')).toBe(true);
  });

  it('keeps every other move a client navigation', () => {
    expect(crossesScannerBoundary('/dashboard', '/dashboard/sessions')).toBe(false);
    expect(crossesScannerBoundary('/dashboard/scanner', '/dashboard/scanner')).toBe(false);
    expect(crossesScannerBoundary('/dashboard', '/dashboard/scanners')).toBe(false);
  });
});
