import type { PackageSummary } from '@/types/package';

// docs/StyleGuide.md §5.8, docs/PRD.md FR-PUB-04: the price a package card shows. Rupiah come from the server
// as stored; nothing here computes a total.
export interface PackagePriceLine {
  // `mulai Rp …` when volume tiers exist and the cheapest one is shown.
  isFromPrice: boolean;
  amount: number;
  basis: 'orang' | 'rombongan';
}

type PricedPackage = Pick<
  PackageSummary,
  'pricingBasis' | 'pricePerPax' | 'flatPrice' | 'lowestTierPrice'
>;

// NULL only for a row that breaks tour_packages_price_ok, which the database does not allow.
export function describePackagePrice(pkg: PricedPackage): PackagePriceLine | null {
  if (pkg.lowestTierPrice !== null) {
    return { isFromPrice: true, amount: pkg.lowestTierPrice, basis: 'orang' };
  }
  if (pkg.pricingBasis === 'per_pax' && pkg.pricePerPax !== null) {
    return { isFromPrice: false, amount: pkg.pricePerPax, basis: 'orang' };
  }
  if (pkg.pricingBasis === 'flat_group' && pkg.flatPrice !== null) {
    return { isFromPrice: false, amount: pkg.flatPrice, basis: 'rombongan' };
  }
  return null;
}
