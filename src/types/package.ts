import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';
import type { RwBadge } from '@/types/rw-unit';

// Prices are integer rupiah as stored (CLAUDE.md §7.1); a page formats them and never computes a total.
export interface PackageSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category: EnumValue<'package_category'>;
  // The RWs the package visits, in leg order: one for an RW package, every RW it visits for a combo.
  rws: RwBadge[];
  durationMinutes: number | null;
  pricingBasis: EnumValue<'pricing_basis'>;
  pricePerPax: number | null;
  flatPrice: number | null;
  // The cheapest volume tier, which the card shows as `mulai …` (docs/StyleGuide.md §5.8).
  lowestTierPrice: number | null;
  minPax: number;
  maxPax: number;
  isFeatured: boolean;
  cover: PublicImage | null;
}

export interface ItineraryStep {
  order: number;
  rw: RwBadge | null;
  time: string | null;
  title: string;
  description: string | null;
}

export interface PriceTier {
  minPax: number;
  maxPax: number | null;
  pricePerPax: number;
}

export interface PackageDetail extends PackageSummary {
  descriptionMd: string | null;
  highlights: string[];
  inclusions: string[];
  itinerary: ItineraryStep[];
  images: PublicImage[];
  priceTiers: PriceTier[];
  validFrom: string | null;
  validTo: string | null;
}

// What /dashboard/packages reads and its actions answer with (Task P4.3.05). Plain values only: they cross into
// client components. Prices are integer rupiah as stored.

export interface PackageLegAdmin {
  rwId: RwId;
  legOrder: number;
  durationMinutes: number | null;
  notes: string | null;
}

export interface PackageTierAdmin {
  id: string;
  minPax: number;
  maxPax: number | null;
  pricePerPax: number;
}

export interface ItineraryStepAdmin {
  rwId: RwId | null;
  time: string | null;
  title: string;
  description: string | null;
}

export interface PackageListItem {
  id: string;
  // NULL for a combo, which belongs to the kelurahan.
  rwId: RwId | null;
  slug: string;
  name: string;
  category: EnumValue<'package_category'>;
  // The RWs the package visits, in leg order.
  rwIds: RwId[];
  pricingBasis: EnumValue<'pricing_basis'>;
  pricePerPax: number | null;
  flatPrice: number | null;
  minPax: number;
  maxPax: number;
  status: EnumValue<'content_status'>;
  isFeatured: boolean;
  updatedAt: string;
}

export interface PackageAdmin extends PackageListItem {
  tagline: string | null;
  descriptionMd: string | null;
  highlights: string[];
  inclusions: string[];
  itinerary: ItineraryStepAdmin[];
  durationMinutes: number | null;
  imagePaths: string[];
  sortOrder: number;
  validFrom: string | null;
  validTo: string | null;
  legs: PackageLegAdmin[];
  priceTiers: PackageTierAdmin[];
}

// One row of package_price_history, written by the database on every price change.
export interface PriceHistoryEntry {
  id: number;
  changedAt: string;
  tierId: string | null;
  oldPricePerPax: number | null;
  newPricePerPax: number | null;
  oldFlatPrice: number | null;
  newFlatPrice: number | null;
}
