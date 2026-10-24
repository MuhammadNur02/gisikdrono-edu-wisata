import { Suspense } from 'react';

import {
  ArticleControls,
  ArticleControlsStatic,
  ArticleList,
  ArticleResults,
  type ArticleBrowserEntry,
} from '@/components/articles/article-browser';
import { ArticleRow, FeaturedArticle } from '@/components/articles/article-entries';
import { articlesPageCopy as text } from '@/lib/copy/catalogue';
import { articleCategories } from '@/lib/utils/article-filters';
import type { BrowseOption } from '@/lib/utils/catalogue-browse';
import type { ArticleSummary } from '@/types/article';
import type { RwUnitSummary } from '@/types/rw-unit';

// The loading frame of /artikel (DESIGN-SPEC §3.14) draws three article cards on this grid.
export const ARTICLE_SKELETON_GRID =
  'grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3';

function entryFor(article: ArticleSummary, rws: readonly RwUnitSummary[]): ArticleBrowserEntry {
  return {
    key: article.id,
    category: article.category,
    searchText: [article.title, article.excerpt, ...article.tags].join(' '),
    featured: <FeaturedArticle article={article} rws={rws} />,
    row: <ArticleRow article={article} />,
  };
}

// The search and the chips beside the page head; until the island reads the address they show unset.
export function ArticleSearch({ categories }: { categories: readonly BrowseOption[] }) {
  const props = {
    categories,
    searchLabel: text.searchLabel,
    searchPlaceholder: text.searchPlaceholder,
    categoryLabel: text.filterCategory,
  };
  return (
    <Suspense fallback={<ArticleControlsStatic {...props} />}>
      <ArticleControls {...props} />
    </Suspense>
  );
}

export interface ArticleCatalogueProps {
  articles: readonly ArticleSummary[];
  rws: readonly RwUnitSummary[];
}

// docs/PRD.md FR-PUB-16 (DESIGN-SPEC §3.8): newest first, the newest featured. Every entry is rendered here on the
// server; the island only chooses which show, so without script the full list is there.
export function ArticleCatalogue({ articles, rws }: ArticleCatalogueProps) {
  const entries = articles.map((article) => entryFor(article, rws));
  const listCopy = { othersLabel: text.others, allShown: text.allShown };
  return (
    <Suspense fallback={<ArticleList entries={entries} {...listCopy} />}>
      <ArticleResults
        entries={entries}
        categories={articleCategories(articles)}
        empty={{ title: text.emptyFilteredTitle, description: text.emptyFilteredBody }}
        {...listCopy}
      />
    </Suspense>
  );
}
