import { describe, expect, it } from 'vitest';

import {
  bookingEnabledOf,
  changedSettings,
  formFieldsOf,
  placeholderFields,
} from '@/lib/utils/site-settings';
import { siteSettingsSchema, type SiteSettingsValues } from '@/lib/validations/settings';

// The rows 0008_seed.sql writes, with the later migrations' privacy keys and booking closed (20261023090000).
const ROWS = [
  { key: 'booking_enabled', value: false },
  { key: 'whatsapp_enabled', value: true },
  { key: 'email_enabled', value: true },
  { key: 'maintenance_mode', value: false },
  { key: 'rate_limit_profile', value: 'normal' },
  { key: 'checkin.grace_before_minutes', value: 60 },
  { key: 'checkin.grace_after_minutes', value: 120 },
  { key: 'booking.hold_minutes_individual', value: 120 },
  { key: 'booking.hold_hours_institution', value: 24 },
  { key: 'booking.quotation_valid_days', value: 14 },
  { key: 'booking.min_lead_hours', value: 12 },
  { key: 'booking.max_advance_days', value: 180 },
  { key: 'booking.max_pax', value: 500 },
  { key: 'pricing.min_price_per_pax', value: 5000 },
  { key: 'pii_retention_months', value: 24 },
  { key: 'finance.expected_payout_account_masked', value: 'BCA ****1234' },
  { key: 'contact.whatsapp_number', value: '+620000000000' },
  { key: 'contact.email', value: 'kontak@example.invalid' },
  { key: 'kelurahan.address', value: 'Kelurahan Gisikdrono, Semarang Barat' },
  { key: 'contact.kopdes_whatsapp_number', value: '+620000000000' },
  { key: 'contact.kopdes_address', value: '[Alamat Koperasi Merah Putih]' },
  { key: 'catalogue.show_product_prices', value: false },
  { key: 'kelurahan.signatory_name', value: '[Nama Lurah Gisikdrono]' },
  { key: 'kelurahan.signatory_title', value: 'Lurah Gisikdrono' },
  { key: 'certificate.template_version', value: 1 },
  { key: 'seo.default_description', value: 'Wisata edukasi di Kelurahan Gisikdrono.' },
  { key: 'privacy.dpo_name', value: '[Nama Pejabat Pelindungan Data]' },
  { key: 'privacy.dpo_email', value: 'privasi@example.invalid' },
  { key: 'some.future_key', value: 'kept out' },
];

function seeded(): SiteSettingsValues {
  return siteSettingsSchema.parse(formFieldsOf(ROWS));
}

describe('formFieldsOf', () => {
  it('reads the seeded rows into a form the schema accepts, without booking_enabled or unknown keys', () => {
    const fields = formFieldsOf(ROWS);
    expect(fields).not.toHaveProperty('bookingEnabled');
    expect(fields).not.toHaveProperty('some.future_key');
    expect(seeded()).toMatchObject({ graceBeforeMinutes: 60, rateLimitProfile: 'normal' });
  });
});

describe('bookingEnabledOf', () => {
  it('reads booking_enabled, closed when the row is missing', () => {
    expect(bookingEnabledOf(ROWS)).toBe(false);
    expect(bookingEnabledOf([{ key: 'booking_enabled', value: true }])).toBe(true);
    expect(bookingEnabledOf([])).toBe(false);
  });
});

describe('changedSettings', () => {
  it('writes only the keys whose value changed, under their database key', () => {
    const current = seeded();
    const next = { ...current, maxPax: 300, maintenanceMode: true };
    expect(changedSettings(current, next)).toEqual([
      { key: 'maintenance_mode', value: true },
      { key: 'booking.max_pax', value: 300 },
    ]);
    expect(changedSettings(current, current)).toEqual([]);
  });
});

describe('placeholderFields', () => {
  it('names the text fields that still hold a placeholder', () => {
    const isPlaceholder = (value: string) => /example\.invalid|^\+620+$|^\[.*\]$/.test(value);
    expect(placeholderFields(seeded(), isPlaceholder)).toEqual([
      'contactWhatsappNumber',
      'contactEmail',
      'kopdesWhatsappNumber',
      'kopdesAddress',
      'dpoName',
      'dpoEmail',
      'signatoryName',
    ]);
  });
});
