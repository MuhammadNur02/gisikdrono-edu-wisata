import { ArrowRight, ChevronRight, Clover } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { CaptionedPhoto, PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';
import { ARTICLE_CATEGORY_LABELS, PACKAGE_CATEGORY } from '@/config/status';
import { articleDetailCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong } from '@/lib/utils/dates';
import { describePackagePrice } from '@/lib/utils/package-price';
import { packagePath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ArticleDetail } from '@/types/article';
import type { PackageSummary } from '@/types/package';
import type { RwUnitSummary } from '@/types/rw-unit';

// The category tag of the head (DESIGN-SPEC §3.8): news in the tint of RW 05, the others in their own colours.
const CATEGORY_TAG = {
  news: 'bg-rw05-tint text-rw05',
  education: 'bg-rw13-tint text-rw13',
  announcement: 'bg-primary-tint text-primary-ink',
} as const satisfies Record<ArticleDetail['category'], string>;

const TRAIL_LINK = 'rounded-md underline-offset-4 hover:text-foreground hover:underline';

// `Beranda › Artikel › Berita`: the trail ends on the category, which opens the list filtered by it. The page's own
// BreadcrumbList (JSON-LD) still ends on the article.
function ArticleTrail({ article }: { article: ArticleDetail }) {
  return (
    <nav aria-label={copy.layout.breadcrumb} className="flex justify-center">
      <ol className="flex flex-wrap items-center gap-1 text-body-sm text-muted-foreground">
        <li className="flex items-center gap-1">
          <Link href="/" className={TRAIL_LINK}>
            Beranda
          </Link>
          <ChevronRight aria-hidden className="size-4" />
        </li>
        <li className="flex items-center gap-1">
          <Link href={PUBLIC_PATHS.articles} className={TRAIL_LINK}>
            Artikel
          </Link>
          <ChevronRight aria-hidden className="size-4" />
        </li>
        <li className="font-medium text-foreground">
          <Link
            href={`${PUBLIC_PATHS.articles}?category=${article.category}`}
            className={TRAIL_LINK}
          >
            {ARTICLE_CATEGORY_LABELS[article.category]}
          </Link>
        </li>
      </ol>
    </nav>
  );
}

// `24 Oktober 2026`: the long date without its weekday.
function dateWithoutWeekday(value: string): string {
  return formatDateLong(value).split(', ').slice(1).join(', ');
}

// The byline: the wordmark's 32 px brick mark and the site's name, the date, the reading time.
function Byline({ article }: { article: ArticleDetail }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-caption text-muted-foreground">
      <span className="inline-flex items-center gap-2 font-semibold text-foreground">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
        >
          <Clover className="size-4.5" />
        </span>
        {text.author}
      </span>
      {article.publishedAt ? (
        <>
          <span aria-hidden className="size-1 rounded-full bg-border-strong" />
          <time dateTime={article.publishedAt}>{dateWithoutWeekday(article.publishedAt)}</time>
        </>
      ) : null}
      <span aria-hidden className="size-1 rounded-full bg-border-strong" />
      <span>{copy.article.readingTime(article.readingMinutes)}</span>
    </p>
  );
}

// The centred head (DESIGN-SPEC §3.8): the trail, the tags, the H1 (Jakarta 52/800 from the intro step, the page's LCP, never animated),
// the lead and the byline.
export function ArticleHead({
  article,
  rw,
}: {
  article: ArticleDetail;
  rw: RwUnitSummary | undefined;
}) {
  return (
    <header className="mx-auto max-w-230 space-y-5 text-center md:space-y-6">
      <ArticleTrail article={article} />
      <div className="flex flex-wrap justify-center gap-2">
        <Badge className={CATEGORY_TAG[article.category]}>
          {ARTICLE_CATEGORY_LABELS[article.category]}
        </Badge>
        {rw ? <RwTag rw={rw} detail={rw.shortName} /> : null}
      </div>
      <h1 className="text-intro text-balance">{article.title}</h1>
      {article.excerpt ? (
        <p className="mx-auto max-w-180 text-body-lg text-pretty text-ink-2 md:text-xl">
          {article.excerpt}
        </p>
      ) : null}
      <Byline article={article} />
    </header>
  );
}

// The cover, 1200 x 620 with radius 20, and its caption under it.
export function ArticleCover({ article }: { article: ArticleDetail }) {
  if (!article.cover) return null;
  return (
    <CaptionedPhoto
      image={article.cover}
      caption={article.cover.alt}
      sizes={IMAGE_SIZES.hero}
      aspectClassName="aspect-4/3 rounded-2xl md:aspect-60/31"
      priority
    />
  );
}

function packageLine(pkg: PackageSummary): string {
  const price = describePackagePrice(pkg);
  return [
    pkg.name,
    pkg.durationMinutes ? copy.catalogue.minutes(pkg.durationMinutes) : null,
    price ? `${formatIDR(price.amount)} ${copy.catalogue.perBasis[price.basis]}` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

function CalloutPhoto({ rw, pkg }: { rw: RwUnitSummary; pkg: PackageSummary | undefined }) {
  return (
    <div className="size-24 shrink-0 overflow-hidden rounded-lg">
      {pkg?.cover ? (
        <PhotoFrame
          image={pkg.cover}
          sizes="96px"
          aspectClassName="size-24"
          className="rounded-none"
          imageClassName="transition-transform duration-500 ease-out-soft group-hover:scale-105"
        />
      ) : (
        <PhotoPlaceholder
          label={rw.name}
          icon={PACKAGE_CATEGORY.regular.icon}
          rws={[rw]}
          className="size-24 rounded-none"
        />
      )}
    </div>
  );
}

// The RW callout at the end of the text (DESIGN-SPEC §3.8): the RW's tint, a 96 px photo, the kampung and its package
// with `Lihat paket`; the photo zooms a little while pointed at. Without a package of its own it leads to the RW page.
export function RwCallout({ rw, pkg }: { rw: RwUnitSummary; pkg: PackageSummary | undefined }) {
  return (
    <aside className="group flex flex-col gap-5 rounded-xl bg-rw-soft p-5 sm:flex-row sm:items-center md:p-6">
      <CalloutPhoto rw={rw} pkg={pkg} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-meta-caps text-rw-strong">{text.rwCalloutEyebrow}</p>
        <p className="font-display text-xl font-bold text-rw-strong">{`${rw.label} · ${rw.shortName}`}</p>
        {pkg ? <p className="text-body-sm text-ink-2">{packageLine(pkg)}</p> : null}
      </div>
      <Button asChild className="shrink-0">
        <Link href={pkg ? packagePath(pkg.slug) : rw.path}>
          {pkg ? text.viewPackage : text.viewRw(rw.label)}
          <ArrowRight aria-hidden data-icon="trailing" />
        </Link>
      </Button>
    </aside>
  );
}
