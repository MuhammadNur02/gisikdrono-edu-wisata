import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatIDR } from '@/lib/utils/currency';
import { describePackagePrice } from '@/lib/utils/package-price';
import type { PackageSummary } from '@/types/package';

export interface PackagePriceProps {
  pkg: PackageSummary;
  className?: string;
}

// The price line of docs/StyleGuide.md §5.8 (DESIGN-SPEC §2.5: the amount in Jakarta 22/700, `mulai` and the unit in
// ink-3), shared by the card, the detail page and its sticky bar. Rupiah come from the server as stored; nothing here
// computes a total (CLAUDE.md §7.1).
export function PackagePrice({ pkg, className }: PackagePriceProps) {
  const price = describePackagePrice(pkg);
  if (!price) return null;
  return (
    <p className={cn('text-body-sm text-muted-foreground', className)}>
      {price.isFromPrice ? `${copy.catalogue.fromPrice} ` : null}
      <span className="text-price text-foreground">{formatIDR(price.amount)}</span>{' '}
      {copy.catalogue.perBasis[price.basis]}
    </p>
  );
}
