import { describe, expect, it } from 'vitest';

import {
  articlePath,
  bookingPath,
  bookletPath,
  guestDocumentPath,
  guestDocumentRewriteFor,
  isPathUnder,
  isRwSlug,
  packagePath,
  productPath,
  RW_ROUTE_FOLDER,
  rwPagePath,
  rwRouteRewriteFor,
  rwSchedulePath,
  visitorPathFor,
} from './paths';

describe('isPathUnder', () => {
  it('matches the prefix and the pages below it', () => {
    expect(isPathUnder('/pesan', '/pesan')).toBe(true);
    expect(isPathUnder('/pesan/eduwisata-ecowastreme', '/pesan')).toBe(true);
  });

  it('does not match a longer word that starts the same way', () => {
    expect(isPathUnder('/pesanan', '/pesan')).toBe(false);
    expect(isPathUnder('/', '/pesan')).toBe(false);
  });
});

describe('entity paths', () => {
  it('spells the public addresses of Appendix A.3', () => {
    expect(packagePath('paket-eduwisata-ecowastreme')).toBe(
      '/paket-wisata/paket-eduwisata-ecowastreme',
    );
    expect(productPath('pupuk-kompos-1kg')).toBe('/produk/pupuk-kompos-1kg');
    expect(articlePath('dolanan-anak-rw-08')).toBe('/artikel/dolanan-anak-rw-08');
    expect(bookletPath('booklet-ecowastreme')).toBe('/e-booklet/booklet-ecowastreme');
    expect(bookingPath('paket-eduwisata-ecowastreme')).toBe(
      '/pesan/paket-eduwisata-ecowastreme?step=jadwal',
    );
    expect(rwPagePath('rw-05-ecowastreme')).toBe('/rw-05-ecowastreme');
    expect(rwSchedulePath('rw-08-kampung-seni-budaya')).toBe('/rw-08-kampung-seni-budaya/jadwal');
  });
});

describe('isRwSlug', () => {
  it('takes the rw_units slugs that rw_units_slug_matches_id allows', () => {
    expect(isRwSlug('rw-05-ecowastreme')).toBe(true);
    expect(isRwSlug('rw-13-kampung-budaya-seni')).toBe(true);
  });

  it.each(['rw-5-ecowastreme', 'rw-05', 'rw-05-', 'RW-05-ecowastreme', 'paket-wisata', 'rw-page'])(
    'refuses %s',
    (value) => {
      expect(isRwSlug(value)).toBe(false);
    },
  );
});

describe('rwRouteRewriteFor', () => {
  it('serves an RW page and its schedule from the internal folder', () => {
    expect(rwRouteRewriteFor('/rw-05-ecowastreme')).toBe('/rw-page/rw-05-ecowastreme');
    expect(rwRouteRewriteFor('/rw-08-kampung-seni-budaya/jadwal')).toBe(
      '/rw-page/rw-08-kampung-seni-budaya/jadwal',
    );
  });

  // An address shaped like an RW page that no RW has still goes to the folder, where the page answers notFound().
  it('serves an unknown address shaped like an RW page from the folder too', () => {
    expect(rwRouteRewriteFor('/rw-99-tidak-ada')).toBe('/rw-page/rw-99-tidak-ada');
  });

  it('sends a direct request for the folder to its root, which has no page', () => {
    expect(rwRouteRewriteFor(RW_ROUTE_FOLDER)).toBe(RW_ROUTE_FOLDER);
    expect(rwRouteRewriteFor('/rw-page/rw-05-ecowastreme')).toBe(RW_ROUTE_FOLDER);
    expect(rwRouteRewriteFor('/rw-page/rw-08-kampung-seni-budaya/jadwal')).toBe(RW_ROUTE_FOLDER);
  });

  it.each([
    '/',
    '/halaman-yang-tidak-ada',
    '/paket-wisata',
    '/paket-wisata/rw-05-ecowastreme',
    '/rw-05-ecowastreme/',
    '/rw-05-ecowastreme/galeri',
    '/rw-05-ecowastreme/jadwal/lagi',
    '/RW-05-ecowastreme',
    '/rw-pages',
  ])('leaves %s to the routes it matches, or to the 404', (pathname) => {
    expect(rwRouteRewriteFor(pathname)).toBeNull();
  });
});

describe('visitorPathFor', () => {
  it('reads an RW page rendered at its internal address as the address the visitor asked for', () => {
    expect(visitorPathFor('/rw-page/rw-05-ecowastreme')).toBe('/rw-05-ecowastreme');
    expect(visitorPathFor('/rw-page/rw-08-kampung-seni-budaya/jadwal')).toBe(
      '/rw-08-kampung-seni-budaya/jadwal',
    );
  });

  it.each(['/', '/rw-05-ecowastreme', '/paket-wisata', RW_ROUTE_FOLDER, '/rw-pages/x'])(
    'keeps %s as it is',
    (pathname) => {
      expect(visitorPathFor(pathname)).toBe(pathname);
    },
  );
});

describe('guest document addresses', () => {
  const id = '0192f3a4-5b6c-7d8e-9f01-000000000001';

  it('builds the address under the booking and rewrites it to the API route', () => {
    const path = guestDocumentPath('GSK-7F3K9Q2M', 'invoice', id);
    expect(path).toBe(`/reservasi/GSK-7F3K9Q2M/dokumen/invoice/${id}`);
    expect(guestDocumentRewriteFor(path)).toBe(`/api/documents/invoice/${id}`);
  });

  it('leaves every other address alone', () => {
    expect(guestDocumentRewriteFor(`/reservasi/GSK-7F3K9Q2M/dokumen/booklet/${id}`)).toBeNull();
    expect(guestDocumentRewriteFor(`/reservasi/bukan-kode/dokumen/invoice/${id}`)).toBeNull();
    expect(guestDocumentRewriteFor('/reservasi/GSK-7F3K9Q2M/dokumen/invoice/../../x')).toBeNull();
    expect(guestDocumentRewriteFor('/reservasi/GSK-7F3K9Q2M')).toBeNull();
  });
});
