import { ListLoading } from '@/components/marketing/catalogue-skeletons';
import { PRODUCT_GRID } from '@/components/products/product-catalogue';
import { productsPageCopy as text } from '@/lib/copy/catalogue';
import { catalogueStateCopy } from '@/lib/copy/catalogue-ui';

const SKELETON_CARDS = 4;

// DESIGN-SPEC §3.14: the page head, the filter bar and the cards in their exact geometry while the list loads.
export default function Loading() {
  return (
    <ListLoading
      title={text.title}
      announcement={catalogueStateCopy.loading(text.noun)}
      kind="product"
      count={SKELETON_CARDS}
      listClassName={PRODUCT_GRID.listClassName}
    />
  );
}
