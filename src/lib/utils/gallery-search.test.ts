import { describe, expect, it } from 'vitest';

import { GALLERY_MAX_PAGES, galleryFilterForRw, galleryQueryFor } from '@/config/gallery';
import {
  canonicalGalleryPathFor,
  galleryPath,
  readGallerySearch,
} from '@/lib/utils/gallery-search';

describe('readGallerySearch', () => {
  it('accepts the addresses the page links to itself', () => {
    expect(readGallerySearch({})).toEqual({
      search: { filter: null, page: 1 },
      isCanonical: true,
    });
    expect(readGallerySearch({ filter: 'rw08', halaman: '3' })).toEqual({
      search: { filter: 'rw08', page: 3 },
      isCanonical: true,
    });
    expect(readGallerySearch({ halaman: String(GALLERY_MAX_PAGES) }).isCanonical).toBe(true);
  });

  it.each([
    ['abc', 1],
    ['2.5', 1],
    ['-3', 1],
    [' 2', 1],
    ['0', 1],
    ['1', 1],
    ['02', 2],
    [String(GALLERY_MAX_PAGES + 1), GALLERY_MAX_PAGES],
    ['99999', GALLERY_MAX_PAGES],
    ['999999999999999999999999', GALLERY_MAX_PAGES],
  ])('sends ?halaman=%s to page %i', (halaman, page) => {
    expect(readGallerySearch({ halaman })).toEqual({
      search: { filter: null, page },
      isCanonical: false,
    });
  });

  it('sends a repeated ?halaman= to the first page', () => {
    expect(readGallerySearch({ halaman: ['2', '3'] })).toEqual({
      search: { filter: null, page: 1 },
      isCanonical: false,
    });
  });

  it('drops a filter it does not know, and keeps the page', () => {
    expect(readGallerySearch({ filter: 'rw00', halaman: '2' })).toEqual({
      search: { filter: null, page: 2 },
      isCanonical: false,
    });
    expect(readGallerySearch({ filter: ['rw05', 'rw08'] }).search.filter).toBeNull();
  });
});

describe('RW filters', () => {
  it("accept any RW number here, since which RWs are online is the page's to check", () => {
    expect(readGallerySearch({ filter: 'rw13' }).isCanonical).toBe(true);
    expect(readGallerySearch({ filter: 'rw5' }).isCanonical).toBe(false);
    expect(readGallerySearch({ filter: 'rw100' }).isCanonical).toBe(false);
  });

  it('ask the gallery for the RW they name, or for a category', () => {
    expect(galleryFilterForRw(5)).toBe('rw05');
    expect(galleryQueryFor('rw13')).toEqual({ owner: 13 });
    expect(galleryQueryFor('kunjungan')).toEqual({ category: 'visit' });
    expect(galleryQueryFor('rw00')).toBeNull();
    expect(galleryQueryFor('xyz')).toBeNull();
  });
});

describe('canonicalGalleryPathFor', () => {
  it.each([
    ['halaman=99999', '/galeri?halaman=20'],
    ['halaman=abc', '/galeri'],
    ['halaman=1', '/galeri'],
    ['filter=xyz&halaman=2', '/galeri?halaman=2'],
    ['filter=rw05&filter=rw08', '/galeri'],
    ['halaman=2&halaman=3', '/galeri'],
  ])('sends ?%s to %s', (query, target) => {
    expect(canonicalGalleryPathFor(new URLSearchParams(query))).toBe(target);
  });

  it('leaves a valid address alone, whatever else it carries', () => {
    expect(canonicalGalleryPathFor(new URLSearchParams('filter=rw08&halaman=3'))).toBeNull();
    expect(canonicalGalleryPathFor(new URLSearchParams('utm_source=wa'))).toBeNull();
  });

  it('always lands on an address it accepts', () => {
    for (const query of ['halaman=0', 'halaman=02', 'filter=a&halaman=-1', 'halaman=21']) {
      const target = canonicalGalleryPathFor(new URLSearchParams(query)) ?? '';
      expect(canonicalGalleryPathFor(new URL(target, 'https://x.test').searchParams)).toBeNull();
    }
  });
});

describe('galleryPath', () => {
  it('leaves out what is the default', () => {
    expect(galleryPath({ filter: null, page: 1 })).toBe('/galeri');
    expect(galleryPath({ filter: 'umkm', page: 1 })).toBe('/galeri?filter=umkm');
    expect(galleryPath({ filter: null, page: 2 })).toBe('/galeri?halaman=2');
    expect(galleryPath({ filter: 'kunjungan', page: 4 })).toBe(
      '/galeri?filter=kunjungan&halaman=4',
    );
  });
});
