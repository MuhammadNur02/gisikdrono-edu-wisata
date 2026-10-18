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
import { ProductCard } from '@/components/products/product-card';
import { RW_IDS, RW_PROGRAMMES } from '@/config/rw';
import { PRODUCT_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { productFacets, rwFilterFor } from '@/lib/utils/catalogue-filters';
import type { ProductSummary } from '@/types/product';

const RW_GROUP: CatalogueFilterGroup = {
  param: 'rw',
  label: copy.catalogue.filterRw,
  options: RW_IDS.map((rwId) => ({ value: rwFilterFor(rwId), label: RW_PROGRAMMES[rwId].label })),
};

// Only the categories that have a product are offered, so no chip leads to an empty list by itself.
function categoryGroup(products: readonly ProductSummary[]): CatalogueFilterGroup {
  return {
    param: 'category',
    label: copy.catalogue.filterProductCategory,
    options: DB_ENUMS.product_category
      .filter((category) => products.some((product) => product.category === category))
      .map((category) => ({ value: category, label: PRODUCT_CATEGORY[category].label })),
  };
}

export interface ProductCatalogueProps {
  products: readonly ProductSummary[];
}

// docs/PRD.md FR-PUB-13: `?rw=` and `?category=`. Every card is rendered here on the server; until the filter
// island loads, and without script, the full list shows.
export function ProductCatalogue({ products }: ProductCatalogueProps) {
  const entries: CatalogueEntry[] = products.map((product) => ({
    key: product.id,
    facets: productFacets(product),
    card: <ProductCard product={product} />,
  }));
  return (
    <NuqsAdapter>
      <Suspense fallback={<CatalogueList entries={entries} {...CARD_GRID_CLASSES} />}>
        <FilteredCatalogue
          groups={[RW_GROUP, categoryGroup(products)]}
          entries={entries}
          emptyMessage={copy.catalogue.productsFilterEmpty}
          {...CARD_GRID_CLASSES}
        />
      </Suspense>
    </NuqsAdapter>
  );
}
