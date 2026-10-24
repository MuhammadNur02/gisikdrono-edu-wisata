import { Newspaper } from 'lucide-react';
import Link from 'next/link';

import { PhotoFrame } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import { siteConfig } from '@/config/site';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { articlePath } from '@/lib/utils/paths';
import type { ArticleSummary } from '@/types/article';

const COVER_ASPECT = 'aspect-16/10';

// DESIGN-SPEC §2.5: the category leads the meta row in its own colour, news in the forest of RW 05, announcements in
// the brick, education in the soga; the colour repeats the word, it never replaces it.
const CATEGORY_TEXT = {
  news: 'text-rw05',
  education: 'text-rw13',
  announcement: 'text-primary-ink',
} as const satisfies Record<ArticleSummary['category'], string>;

export interface ArticleCardProps {
  article: ArticleSummary;
}

// The typographic cover of an article without a photo (DESIGN-SPEC §2.5): night with the light kawung at 10 % and
// the category in gold over the site's name. Decorative, and it never repeats the title: the card's own heading is
// the one place the title is written.
function TypographicCover({ article }: ArticleCardProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'kawung flex flex-col justify-between bg-night p-6 text-white kawung-10 md:p-9',
        COVER_ASPECT,
      )}
    >
      <p className="flex items-center gap-2.5 text-meta-caps text-gold">
        <Newspaper className="size-5" />
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </p>
      <p className="font-display text-lg font-bold text-on-dark-2">{siteConfig.name}</p>
    </div>
  );
}

function ArticleMeta({ article }: ArticleCardProps) {
  const details = [
    article.publishedAt ? formatDateShort(article.publishedAt) : null,
    article.readingMinutes ? copy.article.readingTime(article.readingMinutes) : null,
  ].filter((detail) => detail !== null);
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-muted-foreground">
      <span className={cn('text-meta-caps', CATEGORY_TEXT[article.category])}>
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </span>
      {details.length > 0 ? (
        <>
          <span aria-hidden className="size-0.75 rounded-full bg-current" />
          {article.publishedAt ? (
            <time dateTime={article.publishedAt}>{details.join(' · ')}</time>
          ) : (
            <span>{details.join(' · ')}</span>
          )}
        </>
      ) : null}
    </p>
  );
}

// Card/Article of DESIGN-SPEC §2.5 (docs/PRD.md FR-PUB-06): the 16:10 cover or the typographic one, the meta row, the
// title and the excerpt, straight on the paper. The title link stretches over the card.
export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <article className="group relative flex h-full w-full hover-rise flex-col">
      <div className="overflow-hidden rounded-lg">
        {article.cover ? (
          <PhotoFrame
            image={article.cover}
            sizes={IMAGE_SIZES.card}
            aspectClassName={COVER_ASPECT}
            className="rounded-none"
            imageClassName="hover-zoom"
          />
        ) : (
          <TypographicCover article={article} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 pt-4.5">
        <ArticleMeta article={article} />
        <h3 className="font-display text-xl leading-tight font-bold text-balance transition-colors duration-200 group-hover:text-primary-ink">
          <Link
            href={articlePath(article.slug)}
            className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring"
          >
            {article.title}
          </Link>
        </h3>
        {article.excerpt ? (
          <p className="line-clamp-3 text-body-md text-ink-2">{article.excerpt}</p>
        ) : null}
      </div>
    </article>
  );
}
