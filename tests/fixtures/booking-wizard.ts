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
