import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';
import type { VendorReference } from '@/types/vendor';

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  category: EnumValue<'product_category'>;
  rwId: RwId;
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

export interface ProductDetail extends ProductSummary {
  descriptionMd: string | null;
  minOrderQty: number;
  maxOrderQty: number | null;
  leadTimeDays: number;
  images: PublicImage[];
}
