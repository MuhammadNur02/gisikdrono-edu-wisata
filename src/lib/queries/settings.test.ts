import { describe, expect, it } from 'vitest';

import { isPlaceholderSetting, parsePublicSettings } from '@/lib/queries/settings';

// The public rows exactly as 0008_seed.sql writes them, placeholders included.
const SEEDED_ROWS = [
  { key: 'booking_enabled', value: true },
  { key: 'maintenance_mode', value: false },
  { key: 'booking.min_lead_hours', value: 12 },
  { key: 'booking.max_advance_days', value: 180 },
  { key: 'booking.max_pax', value: 500 },
  { key: 'contact.whatsapp_number', value: '+620000000000' },
  { key: 'contact.email', value: 'kontak@example.invalid' },
  {
    key: 'kelurahan.address',
    value: 'Kelurahan Gisikdrono, Kecamatan Semarang Barat, Kota Semarang, Jawa Tengah',
  },
  { key: 'seo.default_description', value: 'Edu Wisata Kelurahan Gisikdrono, Semarang Barat.' },
  { key: 'privacy.dpo_name', value: '[Nama Pejabat Pelindungan Data]' },
  { key: 'privacy.dpo_email', value: 'privasi@example.invalid' },
  { key: 'contact.kopdes_whatsapp_number', value: '+620000000000' },
  { key: 'contact.kopdes_address', value: '[Alamat Koperasi Merah Putih]' },
];

describe('isPlaceholderSetting', () => {
  it('matches the shapes internal.placeholder_site_settings() flags, and only those', () => {
    expect(isPlaceholderSetting('kontak@EXAMPLE.invalid')).toBe(true);
    expect(isPlaceholderSetting('+620000000000')).toBe(true);
    expect(isPlaceholderSetting('[Nama Lurah Gisikdrono]')).toBe(true);

    expect(isPlaceholderSetting('kelurahan@semarangkota.go.id')).toBe(false);
    expect(isPlaceholderSetting('+6281234567890')).toBe(false);
    expect(isPlaceholderSetting('Jl. Gisikdrono [Blok A]')).toBe(false);
  });
});

describe('parsePublicSettings', () => {
  it('maps the public keys and hides a contact that is still the seeded sample', () => {
    expect(parsePublicSettings(SEEDED_ROWS)).toEqual({
      bookingEnabled: true,
      maintenanceMode: false,
      minLeadHours: 12,
      maxAdvanceDays: 180,
      maxPax: 500,
      contactWhatsappNumber: null,
      contactEmail: null,
      kelurahanAddress:
        'Kelurahan Gisikdrono, Kecamatan Semarang Barat, Kota Semarang, Jawa Tengah',
      kopdesWhatsappNumber: null,
      kopdesAddress: null,
      seoDefaultDescription: 'Edu Wisata Kelurahan Gisikdrono, Semarang Barat.',
      dpoName: null,
      dpoEmail: null,
    });
  });

  it('shows a contact once the kelurahan has filled it in', () => {
    const rows = SEEDED_ROWS.map((row) =>
      row.key === 'contact.email' ? { ...row, value: 'kelurahan@semarangkota.go.id' } : row,
    );

    expect(parsePublicSettings(rows).contactEmail).toBe('kelurahan@semarangkota.go.id');
  });

  it('reads the Kopdes order number and pickup address once they are set', () => {
    const rows = SEEDED_ROWS.map((row) => {
      if (row.key === 'contact.kopdes_whatsapp_number') return { ...row, value: '+6281298765432' };
      if (row.key === 'contact.kopdes_address') return { ...row, value: 'Jl. Contoh No. 1' };
      return row;
    });
    expect(parsePublicSettings(rows)).toMatchObject({
      kopdesWhatsappNumber: '+6281298765432',
      kopdesAddress: 'Jl. Contoh No. 1',
    });
  });

  it('fails loudly when a public key is missing or has the wrong type', () => {
    expect(() => parsePublicSettings(SEEDED_ROWS.slice(1))).toThrow();
    expect(() =>
      parsePublicSettings(
        SEEDED_ROWS.map((row) => (row.key === 'booking.max_pax' ? { ...row, value: '500' } : row)),
      ),
    ).toThrow();
  });
});
