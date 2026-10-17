import { describe, expect, it } from 'vitest';

import { absoluteUrl, buildPageMetadata, rootMetadata } from './metadata';

describe('rootMetadata', () => {
  it('titles every page "<page> | Edu Wisata Gisikdrono"', () => {
    expect(rootMetadata.title).toEqual({
      default: 'Edu Wisata Gisikdrono',
      template: '%s | Edu Wisata Gisikdrono',
    });
    expect(rootMetadata.metadataBase?.origin).toBe('http://127.0.0.1:3000');
  });
});

describe('buildPageMetadata', () => {
  it('sets the canonical path and keeps the Open Graph defaults', () => {
    expect(
      buildPageMetadata({
        title: 'Paket wisata',
        description: 'Semua paket.',
        path: '/paket-wisata',
      }),
    ).toEqual({
      title: 'Paket wisata',
      description: 'Semua paket.',
      alternates: { canonical: '/paket-wisata' },
      openGraph: {
        type: 'website',
        locale: 'id_ID',
        siteName: 'Edu Wisata Gisikdrono',
        title: 'Paket wisata',
        description: 'Semua paket.',
        url: '/paket-wisata',
      },
    });
  });
});

describe('absoluteUrl', () => {
  it('resolves a path against the site URL', () => {
    expect(absoluteUrl('/galeri?filter=rw05')).toBe('http://127.0.0.1:3000/galeri?filter=rw05');
  });
});
