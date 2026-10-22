import { describe, expect, it } from 'vitest';

import { countWord, countWordAtStart } from './number-words';

describe('countWord', () => {
  it.each([
    [1, 'satu'],
    [2, 'dua'],
    [3, 'tiga'],
    [10, 'sepuluh'],
  ])('spells %i as %s', (count, word) => {
    expect(countWord(count)).toBe(word);
  });

  it('keeps a count past ten in digits', () => {
    expect(countWord(11)).toBe('11');
    expect(countWord(42)).toBe('42');
  });
});

describe('countWordAtStart', () => {
  it('capitalises the word for the start of a sentence', () => {
    expect(countWordAtStart(3)).toBe('Tiga');
    expect(countWordAtStart(12)).toBe('12');
  });
});
