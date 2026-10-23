import type { RatingSummary } from '@/types/review';

// The home page's Why-visit figures (docs/StyleGuide.md §1.3 G5): every one is a count of rows the page already
// reads, never a typed-in number. A count of zero says nothing about the place, so it is left out, and with fewer
// than two figures left the whole row is (decision of 2026-10-23).
export const HOME_STATS_MIN_SHOWN = 2;

export type HomeCountKey = 'rws' | 'packages' | 'points' | 'vendors';

export interface HomeCount {
  key: HomeCountKey;
  value: number;
}

export interface HomeStats {
  counts: HomeCount[];
  // Shown as it is (`4,9 dari 12 ulasan`), never counted up; NULL while no review is published.
  rating: RatingSummary | null;
}

export interface HomeStatsSource {
  rwUnits: readonly unknown[];
  // Every published package, not only the featured ones.
  packages: readonly unknown[];
  points: readonly unknown[];
  products: readonly { vendor: { slug: string } | null }[];
  ratingSummary: RatingSummary | null;
}

// Vendors the public can see that sell at least one published product.
export function countVendors(products: HomeStatsSource['products']): number {
  const slugs = new Set(products.flatMap((product) => (product.vendor ? [product.vendor.slug] : [])));
  return slugs.size;
}

export function buildHomeStats(source: HomeStatsSource): HomeStats {
  const counts: HomeCount[] = [
    { key: 'rws', value: source.rwUnits.length },
    { key: 'packages', value: source.packages.length },
    { key: 'points', value: source.points.length },
    { key: 'vendors', value: countVendors(source.products) },
  ];
  const shownCounts = counts.filter((count) => count.value > 0);
  const shownTotal = shownCounts.length + (source.ratingSummary ? 1 : 0);
  if (shownTotal < HOME_STATS_MIN_SHOWN) return { counts: [], rating: null };
  return { counts: shownCounts, rating: source.ratingSummary };
}

export function hasHomeStats(stats: HomeStats): boolean {
  return stats.counts.length > 0 || stats.rating !== null;
}
