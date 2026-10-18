import { ArticleCard } from '@/components/articles/article-card';
import { Section } from '@/components/layout/section';
import { SectionLink } from '@/components/marketing/section-link';
import type { ArticleSummary } from '@/types/article';

export interface LatestArticlesProps {
  id: string;
  articles: readonly ArticleSummary[];
}

export function LatestArticles({ id, articles }: LatestArticlesProps) {
  return (
    <Section id={id} eyebrow="Artikel" title="Kabar dari Edu Center" tone="muted">
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <li key={article.id} className="flex">
            <ArticleCard article={article} />
          </li>
        ))}
      </ul>
      <SectionLink href="/artikel" label="Lihat semua artikel" />
    </Section>
  );
}
