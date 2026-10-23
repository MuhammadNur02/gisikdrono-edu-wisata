import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { SectionLink } from '@/components/marketing/section-link';
import { formatDateShort } from '@/lib/utils/dates';
import { articlePath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ArticleSummary } from '@/types/article';

export interface LatestArticlesProps {
  id: string;
  articles: readonly ArticleSummary[];
}

function ArticleRow({ article }: { article: ArticleSummary }) {
  return (
    <li>
      <Link
        href={articlePath(article.slug)}
        className="group flex min-h-11 flex-col gap-1 rounded-md py-4 sm:flex-row sm:items-baseline sm:gap-8"
      >
        {article.publishedAt ? (
          <time
            dateTime={article.publishedAt}
            className="text-body-sm text-muted-foreground tabular-nums sm:w-32 sm:shrink-0"
          >
            {formatDateShort(article.publishedAt)}
          </time>
        ) : null}
        <span className="flex flex-1 items-start justify-between gap-4">
          <span className="text-h4 underline-offset-4 group-hover:underline">{article.title}</span>
          <ArrowRight
            aria-hidden
            className="mt-1 size-5 shrink-0 text-primary-text transition-transform duration-150 motion-safe:group-hover:translate-x-1"
          />
        </span>
      </Link>
    </li>
  );
}

// docs/PRD.md FR-PUB-06: the three latest articles as a compact list, date and title, no covers (redesign of
// 2026-10-23); /artikel keeps the card grid.
export function LatestArticles({ id, articles }: LatestArticlesProps) {
  return (
    <Section
      id={id}
      eyebrow="Artikel"
      title="Kabar dari Edu Center"
      headerAction={<SectionLink href={PUBLIC_PATHS.articles} label="Lihat semua artikel" />}
    >
      <ul className="reveal divide-y divide-border border-y border-border">
        {articles.map((article) => (
          <ArticleRow key={article.id} article={article} />
        ))}
      </ul>
    </Section>
  );
}
