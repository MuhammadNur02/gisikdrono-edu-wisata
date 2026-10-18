import { describe, expect, it } from 'vitest';

import { MAX_BOOKLET_PDF_BYTES } from '@/config/uploads';

import { checkBookletFile } from './booklet-file';

describe('checkBookletFile', () => {
  it('accepts a PDF up to 50 MB', () => {
    expect(checkBookletFile({ type: 'application/pdf', size: MAX_BOOKLET_PDF_BYTES })).toBeNull();
  });

  it('refuses anything but a PDF, and a PDF over 50 MB', () => {
    expect(checkBookletFile({ type: 'image/jpeg', size: 10 })).toBe('type');
    expect(checkBookletFile({ type: '', size: 10 })).toBe('type');
    expect(checkBookletFile({ type: 'application/pdf', size: MAX_BOOKLET_PDF_BYTES + 1 })).toBe(
      'size',
    );
  });
});
