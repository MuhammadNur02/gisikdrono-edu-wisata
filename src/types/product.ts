import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';
import type { RwBadge } from '@/types/rw-unit';

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  category: EnumValue<'product_category'>;
  rw: RwBadge;
  // Integer rupiah per unitLabel.
  price: number;
  unitLabel: string;
  isAvailable: boolean;
  isFeatured: boolean;
  cover: PublicImage | null;
}

// A product the booking wizard offers as an add-on (docs/PRD.md FR-BOOK-04, switched off by the decision of 2026-10-29):
// on sale as one, ordered within the quantities its vendor takes. The vendor's id is the quote's (its hash binds it);
// the vendor's name is no public information.
export interface AddonProduct {
  id: string;
  vendorId: string;
  rw: RwBadge;
  name: string;
  unitLabel: string;
  // Integer rupiah per unitLabel.
  price: number;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  cover: PublicImage | null;
}

// How the product page orders a product (decision of 2026-10-29): the wa.me link to the Koperasi Merah Putih, null while
// it has no number set, and its address for the pickup, null while it is the seeded placeholder.
export interface ProductOrder {
  chatUrl: string | null;
  pickupAddress: string | null;
}

export interface ProductDetail extends ProductSummary {
  descriptionMd: string | null;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  images: PublicImage[];
}

// What /dashboard/products reads and its actions answer with (Task P4.3.06). Plain values only: they cross into client
// components. Prices are integer rupiah as stored.
export interface ProductListItem {
  id: string;
  rwId: RwId;
  vendorId: string;
  vendorName: string;
  slug: string;
  name: string;
  category: EnumValue<'product_category'>;
  price: number;
  unitLabel: string;
  status: EnumValue<'content_status'>;
  isAddonEligible: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  updatedAt: string;
}

export interface ProductAdmin extends ProductListItem {
  descriptionMd: string | null;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  imagePaths: string[];
  sortOrder: number;
}
