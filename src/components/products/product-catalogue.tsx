import { Suspense } from 'react';

import {
  CatalogueBrowser,
  CatalogueBrowserStatic,
  type CatalogueBrowserEntry,
  type CatalogueBrowserProps,
} from '@/components/marketing/catalogue-browser';
import { ProductCard } from '@/components/products/product-card';
import { AddonPanel } from '@/components/products/product-list-sections';
import { PRODUCT_CATEGORY } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { productsPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import type { BrowseGroup } from '@/lib/utils/catalogue-browse';
import { productFacets, rwFilterFor } from '@/lib/utils/catalogue-filters';
import type { ProductSummary } from '@/types/product';
import type { RwUnitSummary } from '@/types/rw-unit';

// DESIGN-SPEC §3.6: four a row from lg (282 px), three from md, two on phones (168 px media), 24 / 16 px apart.
export const PRODUCT_GRID = {
  listClassName:
    'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-12 lg:grid-cols-4',
  itemClassName: 'flex',
};

// One `?rw=` value for every RW with a product, in their order.
function rwGroup(products: readonly ProductSummary[], rws: readonly RwUnitSummary[]): BrowseGroup {
  return {
    param: 'rw',
    label: text.filterRw,
    allLabel: copy.catalogue.filterAll,
    options: rws
      .filter((rw) => products.some((product) => product.rw.id === rw.id))
      .map((rw) => ({
        value: rwFilterFor(rw.id),
        label: rw.label,
        name: rw.shortName,
        accentKey: rw.accentKey,
      })),
  };
}

// Only the categories that have a product are offered, so no chip leads to an empty list by itself.
function categoryGroup(products: readonly ProductSummary[]): BrowseGroup {
  return {
    param: 'category',
    label: text.filterCategory,
    allLabel: copy.catalogue.filterAll,
    options: DB_ENUMS.product_category
      .filter((category) => products.some((product) => product.category === category))
      .map((category) => ({ value: category, label: PRODUCT_CATEGORY[category].label })),
  };
}

function entryFor(product: ProductSummary): CatalogueBrowserEntry {
  return {
    key: product.id,
    facets: productFacets(product),
    searchText: [product.name, product.vendor?.name, PRODUCT_CATEGORY[product.category].label].join(
      ' ',
    ),
    card: <ProductCard product={product} />,
  };
}

export interface ProductCatalogueProps {
  products: readonly ProductSummary[];
  rws: readonly RwUnitSummary[];
}

// docs/PRD.md FR-PUB-13 (DESIGN-SPEC §3.6): `?rw=` and `?category=` in one row of chips, the count and the search. The
// add-on panel closes the grid when a product can be ordered with a visit. Every card is rendered here on the server.
export function ProductCatalogue({ products, rws }: ProductCatalogueProps) {
  const hasAddons = products.some((product) => product.isAddonEligible);
  const props: CatalogueBrowserProps = {
    entries: products.map(entryFor),
    groups: [rwGroup(products, rws), categoryGroup(products)],
    layout: 'inline',
    noun: text.noun,
    search: { label: text.searchLabel, placeholder: text.searchPlaceholder },
    empty: {
      icon: 'product',
      title: text.emptyFilteredTitle,
      description: text.emptyFilteredBody,
      askLabel: text.emptyAsk,
      askMessage: copy.layout.whatsAppGreeting(text.whatsAppTopic),
    },
    trailing: hasAddons ? <AddonPanel /> : undefined,
    ...PRODUCT_GRID,
  };
  return (
    <Suspense fallback={<CatalogueBrowserStatic {...props} />}>
      <CatalogueBrowser {...props} />
    </Suspense>
  );
}
