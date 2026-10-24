import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import type { BrowseOption } from '@/lib/utils/catalogue-browse';
import type { ArticleSummary } from '@/types/article';

// The category chips of /artikel (DESIGN-SPEC §3.8): only the categories that have an article (`Berita · Pengumuman`).
export function articleCategories(articles: readonly ArticleSummary[]): BrowseOption[] {
  return DB_ENUMS.article_category
    .filter((category) => articles.some((article) => article.category === category))
    .map((category) => ({ value: category, label: ARTICLE_CATEGORY_LABELS[category] }));
}
