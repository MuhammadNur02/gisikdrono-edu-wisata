import { describe, expect, it } from 'vitest';

import { formatFileSize } from '@/lib/utils/file-size';

describe('formatFileSize', () => {
  it('writes megabytes with one Indonesian decimal', () => {
    expect(formatFileSize(2_516_582)).toBe('2,4 MB');
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50 MB');
  });

  it('writes smaller files in whole kilobytes, never zero', () => {
    expect(formatFileSize(350 * 1024)).toBe('350 kB');
    expect(formatFileSize(10)).toBe('1 kB');
  });
});
