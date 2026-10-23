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
import { PACKAGE_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { COMBO_FILTER, packageFacets, rwFilterFor } from '@/lib/utils/catalogue-filters';
import type { PackageSummary } from '@/types/package';
import type { RwBadge } from '@/types/rw-unit';

// `?rw=05`, one value for every RW online, `?rw=combo` and `?type=` (docs/PRD.md FR-PUB-11).
function rwGroup(rws: readonly RwBadge[]): CatalogueFilterGroup {
  return {
    param: 'rw',
    label: copy.catalogue.filterRw,
    options: [
      ...rws.map((rw) => ({ value: rwFilterFor(rw.id), label: rw.label })),
      { value: COMBO_FILTER, label: copy.catalogue.combo },
    ],
  };
}

const TYPE_GROUP: CatalogueFilterGroup = {
  param: 'type',
  label: copy.catalogue.filterPackageType,
  options: DB_ENUMS.package_category.map((category) => ({
    value: category,
    label: PACKAGE_CATEGORY[category].label,
  })),
};

export interface PackageCatalogueProps {
  packages: readonly PackageSummary[];
  // The RWs online, in their order: the `?rw=` options.
  rws: readonly RwBadge[];
}

// Every card is rendered here on the server; until the filter island loads, and without script, the full list
// shows.
export function PackageCatalogue({ packages, rws }: PackageCatalogueProps) {
  const entries: CatalogueEntry[] = packages.map((pkg) => ({
    key: pkg.id,
    facets: packageFacets(pkg),
    card: <PackageCard pkg={pkg} />,
  }));
  return (
    <Suspense fallback={<CatalogueList entries={entries} {...CARD_GRID_CLASSES} />}>
      <FilteredCatalogue
        groups={[rwGroup(rws), TYPE_GROUP]}
        entries={entries}
        emptyMessage={copy.catalogue.packagesFilterEmpty}
        {...CARD_GRID_CLASSES}
      />
    </Suspense>
  );
}
