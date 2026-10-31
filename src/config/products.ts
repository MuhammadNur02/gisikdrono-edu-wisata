// /dashboard/products and its vendors sheet (Task P4.3.06, docs/PRD.md FR-ADMIN-06). Where the table has a CHECK the
// cap is the same number (0003_tables.sql); the others keep a pasted essay or a runaway form from the database.

export const PRODUCT_PATHS = {
  list: '/dashboard/products',
  new: '/dashboard/products/new',
  edit: (id: string) => `/dashboard/products/${id}/edit`,
  // The public page the slug leads to, shown before the slug field.
  publicPrefix: '/produk/',
} as const;

// docs/PRD.md §13.1 A30: the menu's Penjual UMKM opens /dashboard/products with its vendors sheet already open
// (`?penjual=buka`), so the Kopdes admin finds its sellers in one step; the sheet stays where it was for everyone.
export const VENDORS_OPEN_PARAM = 'penjual';
export const VENDORS_OPEN_VALUE = 'buka';
export const VENDORS_PATH = `${PRODUCT_PATHS.list}?${VENDORS_OPEN_PARAM}=${VENDORS_OPEN_VALUE}`;

export const PRODUCT_LIMITS = {
  name: 120,
  descriptionMd: 4000,
  unitLabel: 30,
  // Integer rupiah (CLAUDE.md §7.1).
  priceMax: 100_000_000,
  orderQtyMax: 10_000,
  // products_umkm.lead_time_days is a smallint; a made-to-order product takes days, not years.
  leadTimeDaysMax: 90,
  images: 6,
  // product_variants (20261105170200): the label CHECK and the per-product cap of product_variants_guard.
  variantLabel: 60,
  variants: 20,
} as const;

export const VENDOR_LIMITS = {
  name: 120,
  ownerName: 120,
  descriptionMd: 2000,
} as const;

// The columns a list may sort by (docs/StyleGuide.md §6.4); anything else in the URL is ignored.
export const PRODUCT_SORT_COLUMNS = ['name', 'price', 'updated_at', 'sort_order'] as const;
export const PRODUCT_DEFAULT_SORT = 'updated_at.desc';
export const PRODUCT_DEFAULT_UNIT = 'pcs';
