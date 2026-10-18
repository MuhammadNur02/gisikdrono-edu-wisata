import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPending } from '@/components/marketing/photo-pending';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { IMAGE_SIZES } from '@/config/images';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { formatDateShort } from '@/lib/utils/dates';
import type { ArticleSummary } from '@/types/article';

const COVER_ASPECT = 'aspect-video';

export interface ArticleCardProps {
  article: ArticleSummary;
}

// docs/PRD.md FR-PUB-06: cover, category and date; the title link stretches over the card.
export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Card
      variant="interactive"
      className="relative w-full gap-4 overflow-hidden pt-0 md:gap-4 md:pt-0"
    >
      {article.cover ? (
        <PhotoFrame
          image={article.cover}
          sizes={IMAGE_SIZES.card}
          aspectClassName={COVER_ASPECT}
          className="rounded-none"
        />
      ) : (
        <PhotoPending subject={article.title} className={`${COVER_ASPECT} rounded-none border-0`} />
      )}
      <div className="space-y-3 px-5 md:px-6">
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          <Badge variant="secondary">{ARTICLE_CATEGORY_LABELS[article.category]}</Badge>
          {article.rwId ? <RwTag rwId={article.rwId} /> : null}
          {article.publishedAt ? (
            <time dateTime={article.publishedAt}>{formatDateShort(article.publishedAt)}</time>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-h4">
          <Link
            href={`/artikel/${article.slug}`}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {article.title}
          </Link>
        </h3>
        {article.excerpt ? (
          <p className="line-clamp-3 text-body-sm text-muted-foreground">{article.excerpt}</p>
        ) : null}
      </div>
    </Card>
  );
}
