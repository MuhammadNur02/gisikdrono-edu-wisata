import { Suspense } from 'react';

import {
  CatalogueBrowser,
  CatalogueBrowserStatic,
  type CatalogueBrowserEntry,
  type CatalogueBrowserProps,
} from '@/components/marketing/catalogue-browser';
import { PackageCard } from '@/components/packages/package-card';
import { PACKAGE_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { packagesPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { sortEntries, type BrowseGroup, type BrowseSort } from '@/lib/utils/catalogue-browse';
import { COMBO_FILTER, packageFacets, rwFilterFor } from '@/lib/utils/catalogue-filters';
import { describePackagePrice } from '@/lib/utils/package-price';
import type { PackageSummary } from '@/types/package';
import type { RwUnitSummary } from '@/types/rw-unit';

// DESIGN-SPEC §3.4: three cards a row from lg, two from md, one on phones, 24 px apart.
export const PACKAGE_GRID = {
  listClassName: 'grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3',
  itemClassName: 'flex',
};

// The first sort is the default and never written to the address (`?urut=`).
const SORTS: readonly BrowseSort[] = [
  { value: 'harga', label: text.sortCheapest, key: 'price', direction: 'asc' },
  { value: 'harga-tertinggi', label: text.sortDearest, key: 'price', direction: 'desc' },
  { value: 'durasi', label: text.sortShortest, key: 'duration', direction: 'asc' },
];

// `?rw=05` for every RW a package visits on its own, then `?rw=combo` when a combination exists (docs/PRD.md
// FR-PUB-11). An RW without a package of its own is not offered, so no chip leads to an empty list by itself.
function rwGroup(packages: readonly PackageSummary[], rws: readonly RwUnitSummary[]): BrowseGroup {
  const offered = rws.filter((rw) =>
    packages.some((pkg) => pkg.category !== 'combo' && pkg.rws.some((visit) => visit.id === rw.id)),
  );
  const hasCombo = packages.some((pkg) => pkg.category === 'combo');
  const combo = { value: COMBO_FILTER, label: copy.catalogue.combo, name: copy.catalogue.combo };
  return {
    param: 'rw',
    label: text.filterRw,
    allLabel: text.filterRwAll,
    options: [
      ...offered.map((rw) => ({
        value: rwFilterFor(rw.id),
        label: `${rw.label} · ${rw.shortName}`,
        name: rw.shortName,
        accentKey: rw.accentKey,
      })),
      ...(hasCombo ? [combo] : []),
    ],
  };
}

const TYPE_GROUP: BrowseGroup = {
  param: 'type',
  label: text.filterType,
  allLabel: text.filterTypeAll,
  options: DB_ENUMS.package_category.map((category) => ({
    value: category,
    label: PACKAGE_CATEGORY[category].label,
    name: PACKAGE_CATEGORY[category].label.toLowerCase(),
  })),
};

function entryFor(pkg: PackageSummary): CatalogueBrowserEntry {
  const price = describePackagePrice(pkg);
  return {
    key: pkg.id,
    facets: packageFacets(pkg),
    sortValues: {
      ...(price ? { price: price.amount } : {}),
      ...(pkg.durationMinutes ? { duration: pkg.durationMinutes } : {}),
    },
    card: <PackageCard pkg={pkg} />,
  };
}

export interface PackageCatalogueProps {
  packages: readonly PackageSummary[];
  // The RWs online, in their order: the `?rw=` options.
  rws: readonly RwUnitSummary[];
}

// docs/PRD.md FR-PUB-11 (DESIGN-SPEC §3.4): the filter bar and the grid. Every card is rendered here on the server, in
// the default order (the cheapest first); until the island reads the address, and without script, the full list
// shows under the same bar.
export function PackageCatalogue({ packages, rws }: PackageCatalogueProps) {
  const props: CatalogueBrowserProps = {
    entries: sortEntries(packages.map(entryFor), SORTS[0] ?? null),
    groups: [rwGroup(packages, rws), TYPE_GROUP],
    layout: 'rows',
    noun: text.noun,
    sorts: SORTS,
    empty: {
      icon: 'package',
      title: text.emptyFilteredTitle,
      description: text.emptyFilteredBody,
      choiceTemplate: text.emptyChoice,
      askLabel: text.emptyAsk,
      askMessage: copy.layout.whatsAppGreeting(text.whatsAppTopic),
    },
    ...PACKAGE_GRID,
  };
  return (
    <Suspense fallback={<CatalogueBrowserStatic {...props} />}>
      <CatalogueBrowser {...props} />
    </Suspense>
  );
}
