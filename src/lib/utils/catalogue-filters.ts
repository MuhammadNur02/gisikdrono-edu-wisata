import type { RwId } from '@/config/rw';
import type { PackageSummary } from '@/types/package';
import type { ProductSummary } from '@/types/product';
import type { PublicReview } from '@/types/review';

// docs/PRD.md FR-PUB-11/13/17: the catalogues filter in memory on the cached list, by the values the URL carries
// (`?rw=05`, `?type=student`, `?category=compost`, `?rating=5`), so a filtered list can be shared as a link.
// The server describes each card by the values it answers to; the browser only compares them with the URL, so
// the cards themselves never ship as client code.

// Per URL parameter, the values an item answers to.
export type CatalogueFacets = Readonly<Record<string, readonly string[]>>;
// Per URL parameter, the value chosen; NULL is `Semua`.
export type CatalogueFilters = Readonly<Record<string, string | null>>;

export const COMBO_FILTER = 'combo';
// The RW as the kelurahan writes it, `05`, `08`.
const RW_FILTER_DIGITS = 2;

export function rwFilterFor(rwId: RwId): string {
  return String(rwId).padStart(RW_FILTER_DIGITS, '0');
}

export function matchesFilters(facets: CatalogueFacets, filters: CatalogueFilters): boolean {
  return Object.entries(filters).every(
    ([param, value]) => value === null || (facets[param] ?? []).includes(value),
  );
}

// A combo is a filter of its own on the package list: it belongs to both RWs, so neither RW shows it.
export function packageFacets(pkg: PackageSummary): CatalogueFacets {
  return {
    rw: pkg.category === 'combo' ? [COMBO_FILTER] : pkg.rwIds.map(rwFilterFor),
    type: [pkg.category],
  };
}

export function productFacets(product: ProductSummary): CatalogueFacets {
  return { rw: [rwFilterFor(product.rwId)], category: [product.category] };
}

export function reviewFacets(review: PublicReview): CatalogueFacets {
  return { rating: [String(review.rating)] };
}
