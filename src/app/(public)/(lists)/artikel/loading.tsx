import { ARTICLE_SKELETON_GRID } from '@/components/articles/article-catalogue';
import { ListLoading } from '@/components/marketing/catalogue-skeletons';
import { articlesPageCopy as text } from '@/lib/copy/catalogue';
import { catalogueStateCopy } from '@/lib/copy/catalogue-ui';

const SKELETON_CARDS = 3;

// DESIGN-SPEC §3.14: the page head, the filter bar and the cards in their exact geometry while the list loads.
export default function Loading() {
  return (
    <ListLoading
      title={text.title}
      announcement={catalogueStateCopy.loading(text.noun)}
      kind="article"
      count={SKELETON_CARDS}
      listClassName={ARTICLE_SKELETON_GRID}
    />
  );
}
