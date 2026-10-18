import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';

// Prices are integer rupiah as stored (CLAUDE.md §7.1); a page formats them and never computes a total.
export interface PackageSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category: EnumValue<'package_category'>;
  // The RWs the package visits, in leg order: one for an RW package, both for a combo.
  rwIds: RwId[];
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
  rwId: RwId | null;
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
