import { ListLoading } from '@/components/marketing/catalogue-skeletons';
import { PACKAGE_GRID } from '@/components/packages/package-catalogue';
import { packagesPageCopy as text } from '@/lib/copy/catalogue';
import { catalogueStateCopy } from '@/lib/copy/catalogue-ui';

const SKELETON_CARDS = 3;

// DESIGN-SPEC §3.14: the page head, the filter bar and the cards in their exact geometry while the list loads.
export default function Loading() {
  return (
    <ListLoading
      title={text.title}
      announcement={catalogueStateCopy.loading(text.noun)}
      kind="package"
      count={SKELETON_CARDS}
      listClassName={PACKAGE_GRID.listClassName}
    />
  );
}
