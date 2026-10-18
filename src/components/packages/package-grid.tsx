import { CARD_GRID_CLASSES } from '@/components/marketing/catalogue-list';
import { PackageCard } from '@/components/packages/package-card';
import type { PackageSummary } from '@/types/package';

export interface PackageGridProps {
  packages: readonly PackageSummary[];
}

export function PackageGrid({ packages }: PackageGridProps) {
  return (
    <ul className={CARD_GRID_CLASSES.listClassName}>
      {packages.map((pkg) => (
        <li key={pkg.id} className={CARD_GRID_CLASSES.itemClassName}>
          <PackageCard pkg={pkg} />
        </li>
      ))}
    </ul>
  );
}
