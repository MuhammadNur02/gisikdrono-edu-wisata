// /dashboard/packages (Task P4.3.05, docs/PRD.md FR-ADMIN-05). Where the table has a CHECK the cap is the same number
// (0003_tables.sql); the others keep a pasted essay or a runaway form from reaching the database.

export const PACKAGE_PATHS = {
  list: '/dashboard/packages',
  new: '/dashboard/packages/new',
  edit: (id: string) => `/dashboard/packages/${id}/edit`,
  // The public page the slug leads to, shown before the slug field.
  publicPrefix: '/paket-wisata/',
} as const;

export const PACKAGE_LIMITS = {
  name: 120,
  tagline: 160,
  descriptionMd: 8000,
  listItem: 160,
  listItems: 20,
  // Lines a list textarea may carry, blank ones included, before they are dropped.
  rawLines: 80,
  itinerarySteps: 30,
  itineraryTitle: 120,
  itineraryDescription: 500,
  durationMinutesMax: 1440,
  paxMax: 2000,
  // tour_package_price_tiers.max_pax NULL = open-ended; the exclusion index reads it as 100000.
  tierPaxMax: 2000,
  tiers: 10,
  images: 8,
  // Integer rupiah; the database adds the floor of site_settings pricing.min_price_per_pax.
  priceMax: 1_000_000_000,
  // A combo's legs, one per RW it visits, in order.
  comboLegs: 10,
} as const;

// The columns a list may sort by (docs/StyleGuide.md §6.4); anything else in the URL is ignored.
export const PACKAGE_SORT_COLUMNS = ['name', 'updated_at', 'price_per_pax', 'sort_order'] as const;
export const PACKAGE_DEFAULT_SORT = 'updated_at.desc';
