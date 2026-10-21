import 'server-only';

import { z } from 'zod';

import type { Tables } from '@/db/types';
import { toPublicImages } from '@/lib/queries/mappers';
import { cachedPublicRead, rowOrNull, rowsOf } from '@/lib/queries/public-read';
import { listRwUnits } from '@/lib/queries/rw-units';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { ItineraryStep, PackageDetail, PackageSummary, PriceTier } from '@/types/package';
import type { RwBadge } from '@/types/rw-unit';

const SUMMARY_COLUMNS =
  'id, slug, name, tagline, category, duration_minutes, pricing_basis, price_per_pax, flat_price, min_pax, max_pax, image_paths, is_featured, tour_package_legs(rw_id, leg_order), tour_package_price_tiers(min_pax, max_pax, price_per_pax)';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, description_md, highlights, inclusions, itinerary, valid_from, valid_to`;

// A package's owner is not known before it is read, so every package read carries the umbrella tag.
const PACKAGE_TAGS = [TAGS.allPackages, TAGS.rwUnits];

type PackageRow = Pick<
  Tables<'tour_packages'>,
  | 'id'
  | 'slug'
  | 'name'
  | 'tagline'
  | 'category'
  | 'duration_minutes'
  | 'pricing_basis'
  | 'price_per_pax'
  | 'flat_price'
  | 'min_pax'
  | 'max_pax'
  | 'image_paths'
  | 'is_featured'
> & {
  tour_package_legs: Pick<Tables<'tour_package_legs'>, 'rw_id' | 'leg_order'>[];
  tour_package_price_tiers: Pick<
    Tables<'tour_package_price_tiers'>,
    'min_pax' | 'max_pax' | 'price_per_pax'
  >[];
};

type PackageDetailRow = PackageRow &
  Pick<
    Tables<'tour_packages'>,
    'description_md' | 'highlights' | 'inclusions' | 'itinerary' | 'valid_from' | 'valid_to'
  >;

// tour_packages.itinerary is free JSON written by the package form; a step that does not fit is left out
// rather than breaking the page.
const itineraryStepSchema = z.object({
  order: z.number().int(),
  rw_id: z.number().int().nullish(),
  time: z.string().nullish(),
  title: z.string().min(1),
  description: z.string().nullish(),
});

export function parseItinerary(value: unknown, units: readonly RwBadge[]): ItineraryStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((step) => {
      const parsed = itineraryStepSchema.safeParse(step);
      return parsed.success ? [parsed.data] : [];
    })
    .map((step) => ({
      order: step.order,
      rw: step.rw_id === null || step.rw_id === undefined ? null : rwBadgeFor(step.rw_id, units),
      time: step.time ?? null,
      title: step.title,
      description: step.description ?? null,
    }))
    .sort((first, second) => first.order - second.order);
}

function toPriceTiers(row: PackageRow): PriceTier[] {
  return row.tour_package_price_tiers
    .map((tier) => ({
      minPax: tier.min_pax,
      maxPax: tier.max_pax,
      pricePerPax: tier.price_per_pax,
    }))
    .sort((first, second) => first.minPax - second.minPax);
}

function toPackageSummary(row: PackageRow, units: readonly RwBadge[]): PackageSummary {
  const tierPrices = row.tour_package_price_tiers.map((tier) => tier.price_per_pax);
  const legs = row.tour_package_legs.toSorted(
    (first, second) => first.leg_order - second.leg_order,
  );
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    rws: legs.map((leg) => rwBadgeFor(leg.rw_id, units)),
    durationMinutes: row.duration_minutes,
    pricingBasis: row.pricing_basis,
    pricePerPax: row.price_per_pax,
    flatPrice: row.flat_price,
    lowestTierPrice: tierPrices.length > 0 ? Math.min(...tierPrices) : null,
    minPax: row.min_pax,
    maxPax: row.max_pax,
    isFeatured: row.is_featured,
    cover: toPublicImages(row.image_paths, row.name)[0] ?? null,
  };
}

function toPackageDetail(row: PackageDetailRow, units: readonly RwBadge[]): PackageDetail {
  return {
    ...toPackageSummary(row, units),
    descriptionMd: row.description_md,
    highlights: row.highlights,
    inclusions: row.inclusions,
    itinerary: parseItinerary(row.itinerary, units),
    images: toPublicImages(row.image_paths, row.name),
    priceTiers: toPriceTiers(row),
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

// Published packages only (tour_packages_public_read); pages filter by RW or category in memory.
export const listPackages = cachedPublicRead(
  async (): Promise<PackageSummary[]> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('tour_packages')
        .select(SUMMARY_COLUMNS)
        .order('sort_order')
        .order('name'),
      listRwUnits(),
    ]);
    return rowsOf(result, 'tour_packages').map((row) => toPackageSummary(row, units));
  },
  ['packages', 'list'],
  PACKAGE_TAGS,
);

export const getPackageBySlug = cachedPublicRead(
  async (slug: string): Promise<PackageDetail | null> => {
    const [result, units] = await Promise.all([
      createSupabaseAnonClient()
        .from('tour_packages')
        .select(DETAIL_COLUMNS)
        .eq('slug', slug)
        .maybeSingle(),
      listRwUnits(),
    ]);
    const row = rowOrNull(result, 'tour_packages');
    return row ? toPackageDetail(row, units) : null;
  },
  ['packages', 'by-slug'],
  PACKAGE_TAGS,
);
