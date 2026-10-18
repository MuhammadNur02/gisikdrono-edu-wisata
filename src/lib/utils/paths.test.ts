import { describe, expect, it } from 'vitest';

import {
  articlePath,
  bookingPath,
  bookletPath,
  isPathUnder,
  packagePath,
  productPath,
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
  });
});
