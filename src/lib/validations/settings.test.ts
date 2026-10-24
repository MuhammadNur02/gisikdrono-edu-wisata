import { describe, expect, it } from 'vitest';

import { siteSettingsSchema, type SiteSettingsInput } from './settings';

const SETTINGS: SiteSettingsInput = {
  whatsappEnabled: true,
  emailEnabled: true,
  maintenanceMode: false,
  rateLimitProfile: 'normal',
  graceBeforeMinutes: 60,
  graceAfterMinutes: 120,
  holdMinutesIndividual: 120,
  holdHoursInstitution: 24,
  quotationValidDays: 14,
  minLeadHours: 12,
  maxAdvanceDays: 180,
  maxPax: 500,
  minPricePerPax: 5000,
  piiRetentionMonths: 24,
  expectedPayoutAccountMasked: 'BCA ****1234',
  contactWhatsappNumber: '+6281234567890',
  contactEmail: ' Kontak@Gisikdrono.Go.Id ',
  kelurahanAddress: 'Jl. Gisikdrono, Semarang Barat',
  dpoName: 'Siti Aminah',
  dpoEmail: 'privasi@gisikdrono.go.id',
  signatoryName: 'Budi Santoso',
  signatoryTitle: 'Lurah Gisikdrono',
  certificateTemplateVersion: 1,
  seoDefaultDescription: 'Wisata edukasi di Kelurahan Gisikdrono.',
};

function issuePaths(change: Record<string, unknown>): string[] {
  const result = siteSettingsSchema.safeParse({ ...SETTINGS, ...change });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('siteSettingsSchema', () => {
  it('accepts the settings and normalises the email', () => {
    const parsed = siteSettingsSchema.parse(SETTINGS);
    expect(parsed.contactEmail).toBe('kontak@gisikdrono.go.id');
  });

  it('refuses booking_enabled, or any key it does not know', () => {
    expect(issuePaths({ bookingEnabled: true })).toEqual(['']);
    expect(issuePaths({ 'booking.max_pax': 10 })).toEqual(['']);
  });

  it('refuses numbers that would switch a database rule off or stall it', () => {
    expect(issuePaths({ minPricePerPax: 0 })).toEqual(['minPricePerPax']);
    expect(issuePaths({ piiRetentionMonths: 0 })).toEqual(['piiRetentionMonths']);
    expect(issuePaths({ maxAdvanceDays: 0 })).toEqual(['maxAdvanceDays']);
    expect(issuePaths({ holdMinutesIndividual: 5 })).toEqual(['holdMinutesIndividual']);
    expect(issuePaths({ holdHoursInstitution: 337 })).toEqual(['holdHoursInstitution']);
    expect(issuePaths({ maxPax: 12.5 })).toEqual(['maxPax']);
  });

  it('keeps the payout account masked and the contact number in +62 form', () => {
    expect(issuePaths({ expectedPayoutAccountMasked: '1234567890' })).toEqual([
      'expectedPayoutAccountMasked',
    ]);
    expect(issuePaths({ contactWhatsappNumber: '081234567890' })).toEqual([
      'contactWhatsappNumber',
    ]);
  });

  it('refuses an unknown rate-limit profile and an empty address', () => {
    expect(issuePaths({ rateLimitProfile: 'off' })).toEqual(['rateLimitProfile']);
    expect(issuePaths({ kelurahanAddress: '  ' })).toEqual(['kelurahanAddress']);
  });
});
