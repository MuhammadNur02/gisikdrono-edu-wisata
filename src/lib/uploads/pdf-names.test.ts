import { PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { decodedNameLength, nameSpellings } from './pdf-names';

// Security review of PR #14, F1: a reader decodes a name's escapes once, so two spellings are all there is.

describe('nameSpellings', () => {
  it('adds the reading of a lower-case escape pdf-lib leaves alone', () => {
    expect(nameSpellings(PDFName.of('#4aavaScript'))).toEqual(['#4aavaScript', 'JavaScript']);
  });

  it('gives one spelling for a name without escapes', () => {
    expect(nameSpellings(PDFName.of('Link'))).toEqual(['Link']);
  });

  it('decodes nested escapes once only, so their depth costs nothing', () => {
    // "#23" decodes to "#", so every pass of a decode-until-stable loop peeled one more level off this name.
    const nested = PDFName.of(`#23${'23'.repeat(5_000)}41`);

    expect(nameSpellings(nested)).toHaveLength(2);
  });
});

describe('decodedNameLength', () => {
  it('counts each escape as the one byte it stands for', () => {
    expect(decodedNameLength('Font#20Name')).toBe(9);
    expect(decodedNameLength('#4aava#53cript')).toBe(10);
    expect(decodedNameLength('A'.repeat(127))).toBe(127);
  });
});
