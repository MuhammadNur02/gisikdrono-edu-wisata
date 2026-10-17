import { describe, expect, it } from 'vitest';

import { isSlug, slugify } from './slugify';

describe('slugify', () => {
  it.each([
    ['Eduwisata Ecowastreme', 'eduwisata-ecowastreme'],
    ['Paket Jelajah Ecowastreme & Kampung Seni!', 'paket-jelajah-ecowastreme-kampung-seni'],
    ['  RW 08 — Kampung Seni Budaya  ', 'rw-08-kampung-seni-budaya'],
    ['Kopi Café Gisik', 'kopi-cafe-gisik'],
    ['Pupuk--Kompos__Organik', 'pupuk-kompos-organik'],
    ['2026: Tahun Baru', '2026-tahun-baru'],
  ])('turns %s into %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('!!! ---')).toBe('');
  });

  it('always produces a slug the database CHECK accepts', () => {
    for (const title of [
      'Batik Tulis Bu Siti',
      'Sanggar "Ngesti Budaya"',
      'Kelas Tari 3-5 Tahun',
    ]) {
      expect(isSlug(slugify(title))).toBe(true);
    }
  });
});

describe('isSlug', () => {
  it('accepts lowercase words joined by single dashes', () => {
    expect(isSlug('paket-wisata')).toBe(true);
    expect(isSlug('rw05')).toBe(true);
  });

  it.each(['', 'Paket', 'paket--wisata', '-paket', 'paket-', 'paket wisata', 'paket_wisata'])(
    'refuses %s',
    (value) => {
      expect(isSlug(value)).toBe(false);
    },
  );
});
