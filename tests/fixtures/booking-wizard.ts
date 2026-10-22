import type { PhoneProof } from '@/lib/links/phone-proof';
import type { BookingWizard } from '@/server/services/booking-wizard-service';

// A combo package of RW 05 and RW 13 as the booking wizard reads it (src/server/services/booking-wizard-service.ts),
// with made-up rows: 50.000 rupiah per person, 1 to 200 visitors, no tiers and no add-ons.
export const PACKAGE_ID = '0192f3a4-5b6c-7d8e-9f01-000000000001';

export const comboWizard: BookingWizard = {
  package: {
    id: PACKAGE_ID,
    slug: 'paket-kombinasi',
    name: 'Paket Kombinasi',
    tagline: null,
    category: 'combo',
    rws: [
      { id: 5, label: 'RW 05', accentKey: 'leaf' },
      { id: 13, label: 'RW 13', accentKey: 'terracotta' },
    ],
    durationMinutes: 240,
    pricingBasis: 'per_pax',
    pricePerPax: 50000,
    flatPrice: null,
    lowestTierPrice: null,
    minPax: 1,
    maxPax: 200,
    isFeatured: false,
    cover: null,
    descriptionMd: null,
    highlights: [],
    inclusions: [],
    itinerary: [],
    images: [],
    priceTiers: [],
    validFrom: null,
    validTo: null,
  },
  addons: [],
  rules: { minLeadHours: 12, maxAdvanceDays: 180, maxPax: 500 },
  isOpen: true,
};

export const SESSION_RW05 = '0192f3a4-5b6c-7d8e-9f01-000000000005';
export const SESSION_RW13 = '0192f3a4-5b6c-7d8e-9f01-000000000013';
// The form key the wizard drew once for its draft.
export const WIZARD_MOUNT = '7d444840-9dc0-11d1-b245-5ffdce74fad2';

// What the summary sends for 30 pupils of a school on the combo above: no add-ons and no participant list.
export const schoolBooking = {
  packageId: PACKAGE_ID,
  visitSessionIds: [SESSION_RW05, SESSION_RW13],
  visitDate: '2026-11-12',
  pax: 30,
  bookerType: 'school',
  institutionName: 'SD Negeri Gisikdrono 01',
  picName: 'Ani Lestari',
  picEmail: 'ani@sekolah.sch.id',
  notes: '',
  addons: [],
  participants: [],
  guardianConsent: false,
  privacyAccepted: true,
  idempotencyKey: WIZARD_MOUNT,
  quoteHash: 'f'.repeat(64),
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};

// The request around it, naming the contact the summary shows as verified, as the visitor typed it (review of PR #27,
// M1).
export const bookingRequest = {
  mode: 'pay',
  packageSlug: 'paket-kombinasi',
  booking: schoolBooking,
  shownContact: { channel: 'whatsapp', phone: '0812-3456-7890', email: null },
};

// The gsk_phone proof of that number, verified a minute ago: the cookie lives 30 minutes.
export function freshProof(nowSeconds: number): PhoneProof {
  return {
    channel: 'whatsapp',
    phone: '+6281234567890',
    email: null,
    otpId: '0192f3a4-5b6c-7d8e-9f01-0000000000aa',
    expiresAt: nowSeconds + 29 * 60,
  };
}
