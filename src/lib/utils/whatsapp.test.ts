import { describe, expect, it } from 'vitest';

import {
  buildWhatsAppChatUrl,
  buildWhatsAppShareUrl,
  hasStickyMobileCta,
  isWhatsAppFabHidden,
  pageTopicFromTitle,
} from './whatsapp';

describe('buildWhatsAppChatUrl', () => {
  it('drops the plus sign and encodes the greeting', () => {
    expect(
      buildWhatsAppChatUrl('+6281234567890', 'Halo, saya ingin bertanya tentang Paket & harga'),
    ).toBe(
      'https://wa.me/6281234567890?text=Halo%2C%20saya%20ingin%20bertanya%20tentang%20Paket%20%26%20harga',
    );
  });
});

describe('pageTopicFromTitle', () => {
  const siteName = 'Edu Wisata Gisikdrono';

  it('keeps the page part of a templated title', () => {
    expect(pageTopicFromTitle('Paket wisata | Edu Wisata Gisikdrono', siteName)).toBe(
      'Paket wisata',
    );
  });

  it('falls back to the site name when the title is the site name or empty', () => {
    expect(pageTopicFromTitle('Edu Wisata Gisikdrono', siteName)).toBe(siteName);
    expect(pageTopicFromTitle('', siteName)).toBe(siteName);
    expect(pageTopicFromTitle('  | Edu Wisata Gisikdrono', siteName)).toBe(siteName);
  });
});

describe('isWhatsAppFabHidden', () => {
  it('hides the button on checkout, reservations and the dashboard', () => {
    expect(isWhatsAppFabHidden('/pesan/eduwisata-ecowastreme')).toBe(true);
    expect(isWhatsAppFabHidden('/reservasi/GSK-7F3K9Q2M/bayar')).toBe(true);
    expect(isWhatsAppFabHidden('/dashboard')).toBe(true);
  });

  it('shows it on every public page', () => {
    expect(isWhatsAppFabHidden('/')).toBe(false);
    expect(isWhatsAppFabHidden('/paket-wisata/eduwisata-ecowastreme')).toBe(false);
    expect(isWhatsAppFabHidden('/peta-kontak')).toBe(false);
  });
});

describe('hasStickyMobileCta', () => {
  it('is true on a package page, which has the sticky booking bar, and false elsewhere', () => {
    expect(hasStickyMobileCta('/paket-wisata/eduwisata-ecowastreme')).toBe(true);
    expect(hasStickyMobileCta('/paket-wisata')).toBe(false);
    expect(hasStickyMobileCta('/produk/pupuk-kompos-1kg')).toBe(false);
  });
});

describe('buildWhatsAppShareUrl', () => {
  it('opens the contact picker with the message', () => {
    expect(buildWhatsAppShareUrl('Bayar: https://x.test/a?t=1')).toBe(
      'https://wa.me/?text=Bayar%3A%20https%3A%2F%2Fx.test%2Fa%3Ft%3D1',
    );
  });
});
