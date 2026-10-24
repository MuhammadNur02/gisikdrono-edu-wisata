import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { ArticleCard } from '@/components/articles/article-card';
import { Section } from '@/components/layout/section';
import { Button } from '@/components/ui/button';
import { homeCopy } from '@/lib/copy/home';
import { cn } from '@/lib/utils/cn';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ArticleSummary } from '@/types/article';

export interface LatestArticlesProps {
  id: string;
  articles: readonly ArticleSummary[];
}

// Indexed by the number of articles: three share the row in thirds, two take half each (DESIGN-SPEC §3.1).
const COLUMNS_FOR = ['', 'md:grid-cols-2', 'md:grid-cols-2', 'md:grid-cols-2 lg:grid-cols-3'];

function AllArticlesButton({ className }: { className?: string }) {
  return (
    <Button variant="outline" asChild className={className}>
      <Link href={PUBLIC_PATHS.articles}>
        {homeCopy.articles.all}
        <ArrowRight data-icon="trailing" aria-hidden />
      </Link>
    </Button>
  );
}

// docs/PRD.md FR-PUB-06 (DESIGN-SPEC §3.1 `Artikel terbaru`): the latest published articles as cards with their
// covers, or the typographic cover for one without a photo, on the sunken paper.
export function LatestArticles({ id, articles }: LatestArticlesProps) {
  return (
    <Section
      id={id}
      tone="muted"
      eyebrow={homeCopy.articles.eyebrow}
      title={homeCopy.articles.title}
      description={homeCopy.articles.description}
      headerAction={<AllArticlesButton className="max-md:hidden" />}
    >
      <ul className={cn('grid gap-10 reveal-stagger md:gap-6', COLUMNS_FOR[articles.length])}>
        {articles.map((article) => (
          <li key={article.id} className="flex reveal">
            <ArticleCard article={article} />
          </li>
        ))}
      </ul>
      <AllArticlesButton className="w-full md:hidden" />
    </Section>
  );
}
