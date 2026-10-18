import { PackageCard } from '@/components/packages/package-card';
import type { PackageSummary } from '@/types/package';

export interface PackageGridProps {
  packages: readonly PackageSummary[];
}

// The card grid of docs/StyleGuide.md §4.2.
export function PackageGrid({ packages }: PackageGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {packages.map((pkg) => (
        <li key={pkg.id} className="flex">
          <PackageCard pkg={pkg} />
        </li>
      ))}
    </ul>
  );
}
