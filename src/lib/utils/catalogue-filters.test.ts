import { describe, expect, it } from 'vitest';

import {
  matchesFilters,
  packageFacets,
  productFacets,
  reviewFacets,
  rwFilterFor,
  type CatalogueFacets,
  type CatalogueFilters,
} from '@/lib/utils/catalogue-filters';
import type { PackageSummary } from '@/types/package';
import type { ProductSummary } from '@/types/product';
import type { PublicReview } from '@/types/review';
import type { RwBadge } from '@/types/rw-unit';

const rw = (id: number): RwBadge => ({
  id,
  label: `RW ${String(id).padStart(2, '0')}`,
  accentKey: null,
});

function pkg(slug: string, category: PackageSummary['category'], rwIds: number[]) {
  return {
    id: slug,
    slug,
    name: slug,
    tagline: null,
    category,
    rws: rwIds.map(rw),
    durationMinutes: 120,
    pricingBasis: 'per_pax',
    pricePerPax: 35000,
    flatPrice: null,
    lowestTierPrice: null,
    minPax: 1,
    maxPax: 200,
    isFeatured: false,
    cover: null,
  } satisfies PackageSummary;
}

function product(slug: string, category: ProductSummary['category'], rwId: number) {
  return {
    id: slug,
    slug,
    name: slug,
    category,
    rw: rw(rwId),
    price: 15000,
    unitLabel: 'pcs',
    isAvailable: true,
    isFeatured: false,
    cover: null,
  } satisfies ProductSummary;
}

function review(rating: number) {
  return {
    id: 'ulasan',
    rating,
    title: null,
    body: 'Anak-anak senang memilah sampah.',
    reviewerName: 'Rina',
    institutionName: null,
    rws: [rw(5)],
    isFeatured: false,
    createdAt: '2026-10-01T00:00:00.000Z',
  } satisfies PublicReview;
}

const PACKAGES = [
  pkg('rw05-pelajar', 'student', [5]),
  pkg('rw08-reguler', 'regular', [8]),
  pkg('kombinasi', 'combo', [5, 8]),
  pkg('rw13-reguler', 'regular', [13]),
];

const PRODUCTS = [
  product('kompos', 'compost', 5),
  product('bibit', 'seedling', 5),
  product('gantungan', 'souvenir', 8),
];

function shownSlugs<Item extends { slug: string }>(
  items: readonly Item[],
  facetsOf: (item: Item) => CatalogueFacets,
  filters: CatalogueFilters,
) {
  return items.filter((item) => matchesFilters(facetsOf(item), filters)).map((item) => item.slug);
}

describe('package filters', () => {
  it('shows everything without a filter', () => {
    expect(shownSlugs(PACKAGES, packageFacets, { rw: null, type: null })).toEqual([
      'rw05-pelajar',
      'rw08-reguler',
      'kombinasi',
      'rw13-reguler',
    ]);
  });

  it('keeps an RW to its own packages and the combo to its filter', () => {
    expect(shownSlugs(PACKAGES, packageFacets, { rw: '05', type: null })).toEqual(['rw05-pelajar']);
    expect(shownSlugs(PACKAGES, packageFacets, { rw: 'combo', type: null })).toEqual(['kombinasi']);
    expect(shownSlugs(PACKAGES, packageFacets, { rw: '13', type: null })).toEqual(['rw13-reguler']);
  });

  it('combines the RW and the type', () => {
    expect(shownSlugs(PACKAGES, packageFacets, { rw: '08', type: 'regular' })).toEqual([
      'rw08-reguler',
    ]);
    expect(shownSlugs(PACKAGES, packageFacets, { rw: '08', type: 'student' })).toEqual([]);
  });
});

describe('product filters', () => {
  it('filters by RW and by category', () => {
    expect(shownSlugs(PRODUCTS, productFacets, { rw: '05', category: null })).toEqual([
      'kompos',
      'bibit',
    ]);
    expect(shownSlugs(PRODUCTS, productFacets, { rw: null, category: 'souvenir' })).toEqual([
      'gantungan',
    ]);
    expect(shownSlugs(PRODUCTS, productFacets, { rw: '08', category: 'compost' })).toEqual([]);
  });
});

describe('review filters', () => {
  it('filters by star rating', () => {
    expect(reviewFacets(review(4))).toEqual({ rating: ['4'] });
    expect(matchesFilters(reviewFacets(review(4)), { rating: '5' })).toBe(false);
  });
});

describe('matchesFilters', () => {
  it('treats a parameter the item does not describe as no match', () => {
    expect(matchesFilters({}, { rw: '05' })).toBe(false);
  });
});

describe('rwFilterFor', () => {
  it('writes an RW as the URL spells it', () => {
    expect(rwFilterFor(5)).toBe('05');
    expect(rwFilterFor(8)).toBe('08');
  });
});
