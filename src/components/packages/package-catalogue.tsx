import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';

import {
  CARD_GRID_CLASSES,
  CatalogueList,
  type CatalogueEntry,
} from '@/components/marketing/catalogue-list';
import {
  FilteredCatalogue,
  type CatalogueFilterGroup,
} from '@/components/marketing/filtered-catalogue';
import { PackageCard } from '@/components/packages/package-card';
import { RW_IDS, RW_PROGRAMMES } from '@/config/rw';
import { PACKAGE_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { COMBO_FILTER, packageFacets, rwFilterFor } from '@/lib/utils/catalogue-filters';
import type { PackageSummary } from '@/types/package';

// `?rw=05|08|combo` and `?type=` (docs/PRD.md FR-PUB-11).
const FILTER_GROUPS: CatalogueFilterGroup[] = [
  {
    param: 'rw',
    label: copy.catalogue.filterRw,
    options: [
      ...RW_IDS.map((rwId) => ({ value: rwFilterFor(rwId), label: RW_PROGRAMMES[rwId].label })),
      { value: COMBO_FILTER, label: copy.catalogue.combo },
    ],
  },
  {
    param: 'type',
    label: copy.catalogue.filterPackageType,
    options: DB_ENUMS.package_category.map((category) => ({
      value: category,
      label: PACKAGE_CATEGORY[category].label,
    })),
  },
];

export interface PackageCatalogueProps {
  packages: readonly PackageSummary[];
}

// Every card is rendered here on the server; until the filter island loads, and without script, the full list
// shows.
export function PackageCatalogue({ packages }: PackageCatalogueProps) {
  const entries: CatalogueEntry[] = packages.map((pkg) => ({
    key: pkg.id,
    facets: packageFacets(pkg),
    card: <PackageCard pkg={pkg} />,
  }));
  return (
    <NuqsAdapter>
      <Suspense fallback={<CatalogueList entries={entries} {...CARD_GRID_CLASSES} />}>
        <FilteredCatalogue
          groups={FILTER_GROUPS}
          entries={entries}
          emptyMessage={copy.catalogue.packagesFilterEmpty}
          {...CARD_GRID_CLASSES}
        />
      </Suspense>
    </NuqsAdapter>
  );
}
