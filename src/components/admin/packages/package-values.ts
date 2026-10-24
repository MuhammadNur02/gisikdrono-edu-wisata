import type { EnumValue } from '@/db/enums';
import type { PackageInput } from '@/lib/validations/package';
import type { PackageAdmin } from '@/types/package';

// What the package form starts from (Task P4.3.05): a stored package as its fields hold it, or a blank one.

const DEFAULT_MIN_PAX = 10;
const DEFAULT_MAX_PAX = 50;

export function blankPackage(category: EnumValue<'package_category'>): PackageInput {
  return {
    name: '',
    slug: '',
    category,
    tagline: '',
    descriptionMd: '',
    highlights: [],
    inclusions: [],
    itinerary: [],
    durationMinutes: null,
    pricingBasis: 'per_pax',
    pricePerPax: null,
    flatPrice: null,
    minPax: DEFAULT_MIN_PAX,
    maxPax: DEFAULT_MAX_PAX,
    imagePaths: [],
    isFeatured: false,
    status: 'draft',
    sortOrder: 0,
    validFrom: null,
    validTo: null,
    priceTiers: [],
  };
}

export function packageValues(pkg: PackageAdmin): PackageInput {
  return {
    name: pkg.name,
    slug: pkg.slug,
    category: pkg.category,
    tagline: pkg.tagline ?? '',
    descriptionMd: pkg.descriptionMd ?? '',
    highlights: pkg.highlights,
    inclusions: pkg.inclusions,
    itinerary: pkg.itinerary.map((step) => ({
      rwId: step.rwId,
      time: step.time,
      title: step.title,
      description: step.description ?? '',
    })),
    durationMinutes: pkg.durationMinutes,
    pricingBasis: pkg.pricingBasis,
    pricePerPax: pkg.pricePerPax,
    flatPrice: pkg.flatPrice,
    minPax: pkg.minPax,
    maxPax: pkg.maxPax,
    imagePaths: pkg.imagePaths,
    isFeatured: pkg.isFeatured,
    status: pkg.status,
    sortOrder: pkg.sortOrder,
    validFrom: pkg.validFrom,
    validTo: pkg.validTo,
    priceTiers: pkg.priceTiers.map((tier) => ({ ...tier })),
  };
}
