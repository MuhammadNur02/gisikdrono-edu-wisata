import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isPrelaunch } from '@/config/launch';
import { bookingQuoteHash } from '@/lib/pricing/quote-hash';
import { getPackageBySlug } from '@/lib/queries/packages';
import { listAddonProducts } from '@/lib/queries/products';
import { listAvailableSessions } from '@/lib/queries/sessions';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import type { PackageDetail } from '@/types/package';
import type { AddonProduct } from '@/types/product';
import type { RwBadge } from '@/types/rw-unit';
import type { AvailableSession } from '@/types/session';
import type { PublicSiteSettings } from '@/types/settings';

import {
  listBookableSessions,
  loadBookingWizard,
  quoteWizardBooking,
  wizardPackageOf,
} from './booking-wizard-service';

vi.mock('@/lib/queries/packages', () => ({ getPackageBySlug: vi.fn() }));
vi.mock('@/lib/queries/products', () => ({ listAddonProducts: vi.fn() }));
vi.mock('@/lib/queries/sessions', () => ({ listAvailableSessions: vi.fn() }));
vi.mock('@/lib/queries/settings', () => ({ getPublicSiteSettings: vi.fn() }));
vi.mock('@/config/launch', () => ({ isPrelaunch: vi.fn() }));

const RW05 = { id: 5, label: 'RW 05', accentKey: 'leaf' } as const;
const RW13 = { id: 13, label: 'RW 13', accentKey: 'terracotta' } as const;

const COMBO: PackageDetail = {
  id: '0192f3a4-5b6c-7d8e-9f01-000000000001',
  slug: 'paket-kombinasi',
  name: 'Paket Kombinasi',
  tagline: null,
  category: 'combo',
  rws: [RW05, RW13],
  durationMinutes: 240,
  pricingBasis: 'per_pax',
  pricePerPax: 50000,
  flatPrice: null,
  lowestTierPrice: 45000,
  minPax: 1,
  maxPax: 200,
  isFeatured: false,
  cover: null,
  descriptionMd: null,
  highlights: [],
  inclusions: [],
  itinerary: [],
  images: [],
  priceTiers: [{ minPax: 30, maxPax: null, pricePerPax: 45000 }],
  validFrom: null,
  validTo: null,
};

function addon(id: string, rw: RwBadge, price: number): AddonProduct {
  return {
    id,
    vendorId: `${id.slice(0, -2)}ff`,
    rw,
    name: `Produk ${id.slice(-2)}`,
    unitLabel: 'kantong',
    price,
    minOrderQty: 1,
    maxOrderQty: 50,
    leadTimeDays: 2,
    cover: null,
  };
}

const KOMPOS = addon('0192f3a4-5b6c-7d8e-9f01-0000000000a1', RW05, 15000);
const BATIK = addon('0192f3a4-5b6c-7d8e-9f01-0000000000a2', RW13, 20000);
// An RW the package does not visit: its products are no add-on of this package.
const ELSEWHERE = addon('0192f3a4-5b6c-7d8e-9f01-0000000000a3', { ...RW05, id: 8 }, 9000);

const SETTINGS: PublicSiteSettings = {
  bookingEnabled: true,
  maintenanceMode: false,
  minLeadHours: 12,
  maxAdvanceDays: 180,
  maxPax: 500,
  contactWhatsappNumber: null,
  contactEmail: null,
  kelurahanAddress: null,
  kopdesWhatsappNumber: null,
  kopdesAddress: null,
  seoDefaultDescription: '',
  dpoName: null,
  dpoEmail: null,
};

function session(
  id: string,
  rwId: 5 | 13,
  sessionDate: string,
  startTime: string,
): AvailableSession {
  return {
    id,
    rwId,
    sessionDate,
    startTime,
    endTime: '10:30:00',
    label: 'Sesi Pagi',
    capacity: 40,
    remaining: 40,
  };
}

beforeEach(() => {
  vi.mocked(getPackageBySlug).mockReset().mockResolvedValue(COMBO);
  vi.mocked(getPublicSiteSettings).mockReset().mockResolvedValue(SETTINGS);
  vi.mocked(listAddonProducts).mockReset().mockResolvedValue([KOMPOS, BATIK, ELSEWHERE]);
  vi.mocked(listAvailableSessions).mockReset().mockResolvedValue([]);
  vi.mocked(isPrelaunch).mockReset().mockReturnValue(false);
});

describe('loadBookingWizard', () => {
  it('reads the package, the booking rules and the add-ons of the RWs it visits', async () => {
    const wizard = await loadBookingWizard('paket-kombinasi');
    expect(wizard).toEqual({
      package: COMBO,
      addons: [KOMPOS, BATIK],
      rules: { minLeadHours: 12, maxAdvanceDays: 180, maxPax: 500 },
      isOpen: true,
      isPrelaunch: false,
    });
  });

  it('is null for a package that is not on sale', async () => {
    vi.mocked(getPackageBySlug).mockResolvedValue(null);
    await expect(loadBookingWizard('tidak-ada')).resolves.toBeNull();
  });

  it.each([
    ['booking is switched off', { bookingEnabled: false }],
    ['the site is under maintenance', { maintenanceMode: true }],
  ])('is closed while %s (docs/PRD.md FR-BOOK-01)', async (_case, change) => {
    vi.mocked(getPublicSiteSettings).mockResolvedValue({ ...SETTINGS, ...change });
    await expect(loadBookingWizard('paket-kombinasi')).resolves.toMatchObject({ isOpen: false });
  });

  // docs/Security.md §8.9: the code flag wins over booking_enabled, so the DB switch alone can never open booking.
  it('is closed in a pre-launch build even with booking_enabled on', async () => {
    vi.mocked(isPrelaunch).mockReturnValue(true);
    await expect(loadBookingWizard('paket-kombinasi')).resolves.toMatchObject({
      isOpen: false,
      isPrelaunch: true,
    });
  });
});

describe('wizardPackageOf', () => {
  it('tells the browser no price, and the smaller of the two group limits', async () => {
    vi.mocked(getPublicSiteSettings).mockResolvedValue({ ...SETTINGS, maxPax: 150 });
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    expect(wizardPackageOf(wizard)).toEqual({
      id: COMBO.id,
      slug: 'paket-kombinasi',
      name: 'Paket Kombinasi',
      rws: [RW05, RW13],
      minPax: 1,
      maxPax: 150,
      offersAddons: true,
    });
  });

  it('says whether the package has an add-on on sale, which decides the Tambahan step', async () => {
    vi.mocked(listAddonProducts).mockResolvedValue([]);
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    expect(wizardPackageOf(wizard).offersAddons).toBe(false);
  });
});

describe('listBookableSessions', () => {
  // 08:00 WIB on 1 November: the 12-hour lead time ends at 20:00 WIB the same day.
  const now = new Date('2026-11-01T01:00:00Z');

  it('asks each RW of the package for its sessions between the lead time and the advance window', async () => {
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    await listBookableSessions(wizard, now);
    expect(vi.mocked(listAvailableSessions).mock.calls).toEqual([
      [{ rwId: 5, from: '2026-11-01', to: '2027-04-30' }],
      [{ rwId: 13, from: '2026-11-01', to: '2027-04-30' }],
    ]);
  });

  it('hides a session that starts inside the lead time, as internal.create_booking would refuse it', async () => {
    vi.mocked(listAvailableSessions).mockImplementation(({ rwId }) =>
      Promise.resolve(
        rwId === 5
          ? [
              session('s-today-evening', 5, '2026-11-01', '19:30:00'),
              session('s-today-late', 5, '2026-11-01', '20:00:00'),
              session('s-tomorrow', 5, '2026-11-02', '08:30:00'),
            ]
          : [session('s-rw13', 13, '2026-11-02', '08:30:00')],
      ),
    );
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    const legs = await listBookableSessions(wizard, now);
    expect(legs.map((leg) => [leg.rw.id, leg.sessions.map((each) => each.id)])).toEqual([
      [5, ['s-today-late', 's-tomorrow']],
      [13, ['s-rw13']],
    ]);
  });

  it('keeps to the days the package is sold for (independent review of PR #26, L5)', async () => {
    vi.mocked(getPackageBySlug).mockResolvedValue({
      ...COMBO,
      validFrom: '2026-12-01',
      validTo: '2026-12-31',
    });
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    await listBookableSessions(wizard, now);
    expect(vi.mocked(listAvailableSessions).mock.calls[0]?.[0]).toEqual({
      rwId: 5,
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('asks for nothing once the package is no longer sold', async () => {
    vi.mocked(getPackageBySlug).mockResolvedValue({ ...COMBO, validTo: '2026-10-31' });
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    const legs = await listBookableSessions(wizard, now);
    expect(legs.map((leg) => leg.sessions)).toEqual([[], []]);
    expect(listAvailableSessions).not.toHaveBeenCalled();
  });
});

describe('quoteWizardBooking', () => {
  it('prices the group and its add-ons from the catalogue and hands out the hash the summary sends', async () => {
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    const preview = quoteWizardBooking(wizard, {
      pax: 30,
      addons: [{ productId: KOMPOS.id, qty: 30 }],
    });
    if (!preview.ok) throw new Error('the quote should price');
    expect(preview.quote.total).toBe(30 * 45000 + 30 * 15000);
    expect(preview.quote.lines.map((line) => line.lineTotal)).toEqual([1350000, 450000]);
    expect(preview.quoteHash).toBe(bookingQuoteHash(preview.quote));
  });

  it('answers what to change for a choice the catalogue does not allow', async () => {
    const wizard = await loadBookingWizard('paket-kombinasi');
    if (!wizard) throw new Error('the wizard should load');
    expect(quoteWizardBooking(wizard, { pax: 201, addons: [] })).toEqual({
      ok: false,
      problem: 'pax_out_of_range',
    });
    expect(
      quoteWizardBooking(wizard, { pax: 10, addons: [{ productId: ELSEWHERE.id, qty: 1 }] }),
    ).toEqual({ ok: false, problem: 'addon_unavailable', productId: ELSEWHERE.id });
  });
});
