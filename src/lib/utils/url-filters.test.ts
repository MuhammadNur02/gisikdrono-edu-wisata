import { describe, expect, it } from 'vitest';

import { nextFilterUrl, readUrlFilters } from '@/lib/utils/url-filters';

const GROUPS = [
  { param: 'rw', values: ['05', '13', 'combo'] },
  { param: 'type', values: ['regular', 'student'] },
];

describe('readUrlFilters', () => {
  it('reads a value the group allows and NULL for a missing one', () => {
    expect(readUrlFilters(new URLSearchParams('rw=13'), GROUPS)).toEqual({ rw: '13', type: null });
  });

  it('reads a value outside the allow-list as NULL', () => {
    expect(readUrlFilters(new URLSearchParams('rw=99&type=student'), GROUPS)).toEqual({
      rw: null,
      type: 'student',
    });
  });

  it('ignores parameters no group owns', () => {
    expect(readUrlFilters(new URLSearchParams('halaman=2'), GROUPS)).toEqual({
      rw: null,
      type: null,
    });
  });
});

describe('nextFilterUrl', () => {
  it('sets a value and keeps the parameters it was not asked about, and the hash', () => {
    expect(
      nextFilterUrl(
        new URLSearchParams('type=student&halaman=2'),
        { rw: '05' },
        '/paket-wisata',
        '#daftar',
      ),
    ).toBe('/paket-wisata?type=student&halaman=2&rw=05#daftar');
  });

  it('clears a parameter on NULL and leaves no question mark when nothing remains', () => {
    expect(nextFilterUrl(new URLSearchParams('rw=05'), { rw: null }, '/paket-wisata', '')).toBe(
      '/paket-wisata',
    );
  });

  it('clears several at once, as `Hapus filter` does', () => {
    expect(
      nextFilterUrl(
        new URLSearchParams('rw=05&type=student&q=x'),
        { rw: null, type: null },
        '/produk',
        '',
      ),
    ).toBe('/produk?q=x');
  });

  it('replaces a value already set', () => {
    expect(nextFilterUrl(new URLSearchParams('rw=05'), { rw: '13' }, '/produk', '')).toBe(
      '/produk?rw=13',
    );
  });
});
