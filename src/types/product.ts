import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';
import type { RwBadge } from '@/types/rw-unit';

// What the public site may say about a product's price (decision of 2026-10-30, docs/PRD.md §13.1 A29 decision 7).
// `hidden` while catalogue.show_product_prices is off, and then no amount leaves the server; `unset` while the product
// has none yet ("Harga belum ditentukan"); `set` with integer rupiah per unitLabel.
export type ProductPrice =
  { status: 'hidden' } | { status: 'unset' } | { status: 'set'; amount: number };

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  category: EnumValue<'product_category'>;
  rw: RwBadge;
  price: ProductPrice;
  unitLabel: string;
  isAvailable: boolean;
  isFeatured: boolean;
  cover: PublicImage | null;
  // How many variants the product page offers (decision of 2026-10-30, A29 decision 8), for `3 pilihan` on a card.
  variantCount: number;
}

// One variant of a product (a motif or a colour), in the product's order. Its photo is one of the product's own.
export interface ProductVariant {
  id: string;
  label: string;
  image: PublicImage | null;
  isAvailable: boolean;
}

// A product the booking wizard offers as an add-on (docs/PRD.md FR-BOOK-04, switched off by the decision of 2026-10-29):
// on sale as one, ordered within the quantities its vendor takes. Nothing of its vendor is public information.
export interface AddonProduct {
  id: string;
  rw: RwBadge;
  name: string;
  unitLabel: string;
  // Integer rupiah per unitLabel; a product without a price is never an add-on (products_umkm_addon_has_price).
  price: number;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  cover: PublicImage | null;
}

// How the product page orders a product (decision of 2026-10-29): the Koperasi Merah Putih's number as wa.me digits,
// null while it has no usable number set, and its address for the pickup, null while it is the seeded placeholder. The
// number is public (it is the link itself), so the variant picker builds the link in the browser with the variant in it.
export interface ProductOrder {
  whatsappDigits: string | null;
  pickupAddress: string | null;
}

export interface ProductDetail extends ProductSummary {
  descriptionMd: string | null;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  images: PublicImage[];
  variants: ProductVariant[];
}

// What /dashboard/products reads and its actions answer with (Task P4.3.06). Plain values only: they cross into client
// components. Prices are integer rupiah as stored, null while the owner has not set one (decision of 2026-10-30).
export interface ProductListItem {
  id: string;
  rwId: RwId;
  vendorId: string;
  vendorName: string;
  slug: string;
  name: string;
  category: EnumValue<'product_category'>;
  price: number | null;
  unitLabel: string;
  status: EnumValue<'content_status'>;
  isAddonEligible: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  updatedAt: string;
}

// A variant as the product form edits it: its label, its photo (one of the product's imagePaths) and whether it is
// on sale, in the order the form lists them.
export interface ProductVariantAdmin {
  label: string;
  imagePath: string | null;
  isAvailable: boolean;
}

export interface ProductAdmin extends ProductListItem {
  descriptionMd: string | null;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  imagePaths: string[];
  sortOrder: number;
  variants: ProductVariantAdmin[];
}

// The Kopdes admin's overview (docs/PRD.md §13.1 A30): the UMKM catalogue of every RW, in counts.
export interface UmkmCatalogueCounts {
  publishedProducts: number;
  draftProducts: number;
  activeVendors: number;
}
