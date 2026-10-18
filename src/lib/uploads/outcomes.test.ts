import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';

import { failureFor, refusalSeverity } from './outcomes';

describe('refusalSeverity', () => {
  it('ranks a refused officer high, a doctored file medium and an honest mistake info', () => {
    expect(refusalSeverity('forbidden')).toBe('high');
    expect(refusalSeverity('pdf_active_content')).toBe('medium');
    expect(refusalSeverity('svg')).toBe('medium');
    expect(refusalSeverity('heic')).toBe('info');
    expect(refusalSeverity('pdf_too_many_pages')).toBe('info');
  });
});

describe('failureFor', () => {
  it('answers a missing file or booklet as not found, everything else as validation', () => {
    expect(failureFor('booklet_missing')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: copy.uploads.problems.booklet_missing },
    });
    expect(failureFor('missing').error.code).toBe('NOT_FOUND');
    expect(failureFor('pdf_too_many_pages')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: copy.uploads.problems.pdf_too_many_pages },
    });
  });
});
