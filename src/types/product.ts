import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';
import type { RwBadge } from '@/types/rw-unit';
import type { VendorReference } from '@/types/vendor';

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
  isAddonEligible: boolean;
  isFeatured: boolean;
  // NULL when the vendor has been deactivated, which hides it from the public.
  vendor: VendorReference | null;
  cover: PublicImage | null;
}

// A product the booking wizard offers as an add-on (docs/PRD.md FR-BOOK-04): on sale as one, from a vendor the public
// still sees, ordered within the quantities its vendor takes.
export interface AddonProduct {
  id: string;
  vendorId: string;
  vendorName: string;
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

export interface ProductDetail extends ProductSummary {
  descriptionMd: string | null;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  images: PublicImage[];
}
