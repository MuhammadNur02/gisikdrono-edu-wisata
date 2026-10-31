import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireFreshTotp, type StaffContext } from '@/server/auth/guards';
import { updateCatalogueSettings, updateSiteSettings } from '@/server/services/settings-service';

import { updateCatalogueSettingsAction, updateSiteSettingsAction } from './settings';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireFreshTotp: vi.fn() }));
vi.mock('@/server/services/settings-service', () => ({
  updateSiteSettings: vi.fn(),
  updateCatalogueSettings: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: 1, claimsVersion: 1 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const KOPDES: StaffContext = { ...BASE, role: 'admin_kopdes', rwId: null };
const SETTINGS = {
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
  contactEmail: 'kontak@gisikdrono.go.id',
  kelurahanAddress: 'Jl. Gisikdrono, Semarang Barat',
  kopdesWhatsappNumber: '+6281298765432',
  kopdesAddress: 'Jl. Gisikdrono, Semarang Barat',
  showProductPrices: false,
  dpoName: 'Siti Aminah',
  dpoEmail: 'privasi@gisikdrono.go.id',
  signatoryName: 'Budi Santoso',
  signatoryTitle: 'Lurah Gisikdrono',
  certificateTemplateVersion: 1,
  seoDefaultDescription: 'Wisata edukasi di Kelurahan Gisikdrono.',
};

beforeEach(() => {
  vi.mocked(requireFreshTotp).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(updateSiteSettings).mockReset().mockResolvedValue(2);
  vi.mocked(updateCatalogueSettings).mockReset().mockResolvedValue(1);
  vi.mocked(revalidateTag).mockReset();
});

describe('updateSiteSettingsAction', () => {
  it('saves with a fresh TOTP code of the last five minutes and revalidates the settings', async () => {
    const result = await updateSiteSettingsAction(SETTINGS);
    expect(result).toEqual({ ok: true, data: 2 });
    expect(requireFreshTotp).toHaveBeenCalledWith(300);
    expect(updateSiteSettings).toHaveBeenCalledWith(SUPERADMIN, SETTINGS);
    expect(revalidateTag).toHaveBeenCalledWith('settings');
  });

  it('refuses a stale session and an RW admin before anything is written', async () => {
    vi.mocked(requireFreshTotp).mockResolvedValueOnce({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'stale' },
    });
    expect((await updateSiteSettingsAction(SETTINGS)).ok).toBe(false);
    vi.mocked(requireFreshTotp).mockResolvedValueOnce({ ok: true, ctx: ADMIN_05 });
    expect(await updateSiteSettingsAction(SETTINGS)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(updateSiteSettings).not.toHaveBeenCalled();
  });

  it('refuses a form that tries to switch booking_enabled', async () => {
    const result = await updateSiteSettingsAction({ ...SETTINGS, bookingEnabled: true });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(requireFreshTotp).not.toHaveBeenCalled();
  });
});

describe('a save that fails part-way', () => {
  it('still revalidates the settings, since earlier keys may have saved', async () => {
    vi.mocked(updateSiteSettings).mockRejectedValueOnce(new Error('connection reset'));
    const result = await updateSiteSettingsAction(SETTINGS);
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(revalidateTag).toHaveBeenCalledWith('settings');
  });
});

// docs/PRD.md §13.1 A30: Pengaturan Katalog, the Kopdes admin's three keys.
describe('updateCatalogueSettingsAction', () => {
  const CATALOGUE = {
    kopdesWhatsappNumber: '+6281298765432',
    kopdesAddress: 'Jl. Koperasi 1, Gisikdrono',
    showProductPrices: true,
  };

  it('saves the catalogue keys for a UMKM manager with a fresh TOTP code', async () => {
    vi.mocked(requireFreshTotp).mockResolvedValueOnce({ ok: true, ctx: KOPDES });
    expect(await updateCatalogueSettingsAction(CATALOGUE)).toEqual({ ok: true, data: 1 });
    expect(requireFreshTotp).toHaveBeenCalledWith(300, ['superadmin', 'admin_kopdes']);
    expect(updateCatalogueSettings).toHaveBeenCalledWith(KOPDES, CATALOGUE);
    expect(revalidateTag).toHaveBeenCalledWith('settings');
  });

  it('takes no other key, so a Kopdes admin cannot ride one along', async () => {
    const result = await updateCatalogueSettingsAction({ ...CATALOGUE, maintenanceMode: true });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(requireFreshTotp).not.toHaveBeenCalled();
  });

  it('refuses whoever the guard refuses, an RW admin among them', async () => {
    vi.mocked(requireFreshTotp).mockResolvedValueOnce({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'no' },
    });
    expect((await updateCatalogueSettingsAction(CATALOGUE)).ok).toBe(false);
    expect(updateCatalogueSettings).not.toHaveBeenCalled();
  });
});

describe('updateSiteSettingsAction for the Kopdes admin', () => {
  it('refuses the whole form, which is the superadmin alone', async () => {
    vi.mocked(requireFreshTotp).mockResolvedValueOnce({ ok: true, ctx: KOPDES });
    expect(await updateSiteSettingsAction(SETTINGS)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(updateSiteSettings).not.toHaveBeenCalled();
  });
});
