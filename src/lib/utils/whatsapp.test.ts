import { describe, expect, it } from 'vitest';

import {
  buildOrderChatUrl,
  buildWhatsAppChatUrl,
  buildWhatsAppShareUrl,
  hasStickyMobileCta,
  isWhatsAppFabHidden,
  pageTopicFromTitle,
  whatsAppDigitsOf,
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

describe('whatsAppDigitsOf', () => {
  it('reads an Indonesian number however it is written', () => {
    expect(whatsAppDigitsOf('+6281234567890')).toBe('6281234567890');
    expect(whatsAppDigitsOf('+62 812-3456-7890')).toBe('6281234567890');
    expect(whatsAppDigitsOf('0812 3456 7890')).toBe('6281234567890');
    expect(whatsAppDigitsOf('62 812 3456 7890')).toBe('6281234567890');
  });

  it('refuses what is no Indonesian WhatsApp number', () => {
    expect(whatsAppDigitsOf(null)).toBeNull();
    expect(whatsAppDigitsOf('')).toBeNull();
    expect(whatsAppDigitsOf('+62 812')).toBeNull();
    expect(whatsAppDigitsOf('+62812345678901234')).toBeNull();
    expect(whatsAppDigitsOf('+31612345678')).toBeNull();
    expect(whatsAppDigitsOf('nomor menyusul')).toBeNull();
  });
});

describe('buildOrderChatUrl', () => {
  it('opens the number with the whole message encoded', () => {
    expect(
      buildOrderChatUrl(
        '+62 812-3456-7890',
        'Halo Koperasi Merah Putih, saya ingin memesan Kompos & Bibit (RW 05). Jumlah: ',
      ),
    ).toBe(
      'https://wa.me/6281234567890?text=Halo%20Koperasi%20Merah%20Putih%2C%20saya%20ingin%20memesan%20Kompos%20%26%20Bibit%20(RW%2005).%20Jumlah%3A%20',
    );
  });

  it('keeps line breaks, question marks and hashes inside the text', () => {
    expect(buildOrderChatUrl('081234567890', 'Baris 1\nApa ada? #2')).toBe(
      'https://wa.me/6281234567890?text=Baris%201%0AApa%20ada%3F%20%232',
    );
  });

  it('gives no link while the Kopdes has no usable number, so the button is left out', () => {
    expect(buildOrderChatUrl(null, 'Halo')).toBeNull();
    expect(buildOrderChatUrl('+62', 'Halo')).toBeNull();
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
