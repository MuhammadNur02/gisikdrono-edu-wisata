import { ArrowRight, ArrowUpRight, Newspaper } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { Badge } from '@/components/ui/badge';
import { IMAGE_SIZES } from '@/config/images';
import { siteConfig } from '@/config/site';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { articlesPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { articlePath } from '@/lib/utils/paths';
import type { ArticleSummary } from '@/types/article';
import type { RwUnitSummary } from '@/types/rw-unit';

// DESIGN-SPEC §2.5: the category in its own colour, news in the forest of RW 05, announcements in the brick, education
// in the soga; the colour repeats the word, it never replaces it.
const CATEGORY_TEXT = {
  news: 'text-rw05',
  education: 'text-rw13',
  announcement: 'text-primary-ink',
} as const satisfies Record<ArticleSummary['category'], string>;

// The whole entry is one link: its title link stretches over it.
const STRETCHED_LINK =
  'outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring';

// The typographic cover of an article without a photo (DESIGN-SPEC §2.5): night with the light kawung at 10 %, the
// category in gold over the site's name. Decorative: the entry's heading is where the title is written.
function TypographicCover({ article, className }: { article: ArticleSummary; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'kawung flex flex-col justify-between bg-night p-5 text-white kawung-10 md:p-6',
        className,
      )}
    >
      <p className="flex items-center gap-2 text-meta-caps text-gold">
        <Newspaper className="size-4.5" />
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </p>
      <p className="font-display text-body-md font-bold text-on-dark-2">{siteConfig.name}</p>
    </div>
  );
}

function Cover({
  article,
  aspect,
  sizes,
}: {
  article: ArticleSummary;
  aspect: string;
  sizes: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg">
      {article.cover ? (
        <PhotoFrame
          image={article.cover}
          sizes={sizes}
          aspectClassName={aspect}
          className="rounded-none"
          imageClassName="hover-zoom"
        />
      ) : (
        <TypographicCover article={article} className={aspect} />
      )}
    </div>
  );
}

// `BERITA · 24 Okt 2026 · 2 menit baca`.
function Meta({ article }: { article: ArticleSummary }) {
  const details = [
    article.publishedAt ? formatDateShort(article.publishedAt) : null,
    article.readingMinutes ? copy.article.readingTime(article.readingMinutes) : null,
  ].filter((detail) => detail !== null);
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-muted-foreground">
      <span className={cn('text-meta-caps', CATEGORY_TEXT[article.category])}>
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </span>
      {details.length > 0 ? <span>{details.join(' · ')}</span> : null}
    </p>
  );
}

function rwUnitOf(
  article: ArticleSummary,
  rws: readonly RwUnitSummary[],
): RwUnitSummary | undefined {
  return article.rw ? rws.find((rw) => rw.id === article.rw?.id) : undefined;
}

// The newest article (DESIGN-SPEC §3.8): the 700 x 440 cover beside its text, `Terbaru`, the title in Jakarta 38/800, the
// excerpt, the RW and `Baca artikel`. Pointed at, the cover zooms, the title turns brick and the arrow steps on.
export function FeaturedArticle({
  article,
  rws,
}: {
  article: ArticleSummary;
  rws: readonly RwUnitSummary[];
}) {
  const rw = rwUnitOf(article, rws);
  return (
    <article className="group relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-14">
      <div className="lg:w-175 lg:shrink-0">
        <Cover article={article} aspect="aspect-16/10" sizes={IMAGE_SIZES.split} />
      </div>
      <div className="min-w-0 flex-1 space-y-4 md:space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-primary-tint text-primary-ink">{text.latest}</Badge>
          <Meta article={article} />
        </div>
        <h2 className="font-display text-3xl leading-tight font-extrabold tracking-tight text-balance transition-colors duration-200 group-hover:text-primary-ink md:text-4xl">
          <Link href={articlePath(article.slug)} className={STRETCHED_LINK}>
            {article.title}
          </Link>
        </h2>
        {article.excerpt ? <p className="text-body-lg text-ink-2">{article.excerpt}</p> : null}
        <div className="flex flex-wrap items-center gap-4">
          {rw ? <RwTag rw={rw} detail={rw.shortName} /> : null}
          <span
            aria-hidden
            className="inline-flex items-center gap-1.5 text-label font-semibold text-primary-ink"
          >
            {text.read}
            <ArrowRight className="size-4.5 hover-nudge" />
          </span>
        </div>
      </div>
    </article>
  );
}

// A row of "Artikel lainnya" (DESIGN-SPEC §3.8): the 300 x 190 cover, the meta, the title in Jakarta 26, the excerpt and
// the diagonal arrow; the row's paper turns sunken while pointed at. On phones it stacks as a card.
export function ArticleRow({ article }: { article: ArticleSummary }) {
  return (
    <article className="group relative flex flex-col gap-4 py-6 transition-colors duration-200 md:flex-row md:items-center md:gap-10 md:py-7 lg:-mx-4 lg:rounded-lg lg:px-4 lg:hover:bg-muted">
      <div className="md:w-75 md:shrink-0">
        <Cover article={article} aspect="aspect-30/19" sizes={IMAGE_SIZES.card} />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <Meta article={article} />
        <h3 className="font-display text-xl leading-tight font-bold text-balance transition-colors duration-200 group-hover:text-primary-ink md:text-2xl">
          <Link href={articlePath(article.slug)} className={STRETCHED_LINK}>
            {article.title}
          </Link>
        </h3>
        {article.excerpt ? (
          <p className="line-clamp-2 max-w-170 text-body-md text-ink-2 md:text-body">
            {article.excerpt}
          </p>
        ) : null}
      </div>
      <ArrowUpRight
        aria-hidden
        className="size-5 shrink-0 hover-nudge-diagonal text-ink-2 max-md:hidden md:mr-4"
      />
    </article>
  );
}
