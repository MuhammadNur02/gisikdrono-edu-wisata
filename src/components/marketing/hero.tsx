import { Images } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { HeroProductCard } from '@/components/marketing/hero-product-card';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { RatingStars } from '@/components/reviews/rating-stars';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';
import { BOOKING_CTA } from '@/config/nav';
import { siteConfig } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatRating } from '@/lib/utils/ratings';
import type { HeroBanner, HeroSlideData } from '@/types/banner';
import type { ProductSummary } from '@/types/product';
import type { RatingSummary } from '@/types/review';

// docs/StyleGuide.md §5.7, docs/PRD.md FR-PUB-01. Below md the slide is portrait and loses the sides of a
// landscape photo, from md it is 16:9 and loses the top and bottom; anchoring the crop at the top left keeps
// the people and the place in view and leaves out what sits in the bottom-right corner (decision of
// 2026-10-18, for the demo hero's fan).
const SLIDE_ASPECT = 'aspect-4/5 md:aspect-video';
const SLIDE_CROP = 'object-left-top';
const SECONDARY_CTA_LABEL = 'Lihat Paket';

// The carousel and embla load only for a page that has more than one banner to rotate; the slides
// themselves are still rendered on the server (docs/StyleGuide.md §5.0, heavy islands code-split).
const HeroCarousel = dynamic(() =>
  import('@/components/marketing/hero-carousel').then((module) => module.HeroCarousel),
);

export interface HeroProps {
  slides: readonly HeroSlideData[];
  ratingSummary: RatingSummary | null;
  // site_settings `seo.default_description`, for the hero shown before any banner exists.
  description: string;
  // Where `Lihat Paket` scrolls to; left out when the page has no featured packages.
  packagesAnchor?: string;
}

function HeroActions({ banner, packagesAnchor }: { banner?: HeroBanner; packagesAnchor?: string }) {
  const primary =
    banner?.ctaLabel && banner.ctaHref
      ? { label: banner.ctaLabel, href: banner.ctaHref }
      : { label: BOOKING_CTA.label, href: BOOKING_CTA.href };
  return (
    <div className="flex flex-wrap gap-3">
      <Button size="xl" asChild>
        <Link href={primary.href}>{primary.label}</Link>
      </Button>
      {packagesAnchor ? (
        <Button
          size="xl"
          variant="outline"
          asChild
          className={
            banner ? 'border-white bg-transparent text-white hover:bg-white/10' : undefined
          }
        >
          <Link href={`#${packagesAnchor}`}>{SECONDARY_CTA_LABEL}</Link>
        </Button>
      ) : null}
    </div>
  );
}

interface HeroSlideProps {
  banner: HeroBanner;
  // Only the first slide carries the page's h1 and the LCP image (§5.7, §8.2).
  isFirst: boolean;
  product: ProductSummary | null;
  packagesAnchor?: string;
}

function HeroSlide({ banner, isFirst, product, packagesAnchor }: HeroSlideProps) {
  const Title = isFirst ? 'h1' : 'p';
  // The photo fills the slide behind the text, and the text stays in the flow: a long title on a narrow
  // phone makes the slide taller instead of running off the photo. aspect-ratio grows with its content only
  // while the box itself does not clip, so the photo and the overlay round their own corners.
  return (
    <div className={cn('relative flex rounded-2xl', SLIDE_ASPECT)}>
      <PhotoFrame
        image={banner.image}
        sizes={IMAGE_SIZES.hero}
        aspectClassName=""
        objectPositionClassName={SLIDE_CROP}
        priority={isFirst}
        className="absolute inset-0 rounded-2xl"
      />
      <div aria-hidden className="absolute inset-0 rounded-2xl bg-brand-deep/60" />
      <div className="relative flex flex-col justify-end gap-4 self-end p-6 text-white md:p-10 lg:p-12">
        <p className="text-overline text-brand-ice">{siteConfig.name}</p>
        <Title className="max-w-3xl text-display-xl text-balance">{banner.title}</Title>
        {banner.subtitle ? (
          <p className="max-w-2xl text-body-lg text-pretty text-brand-ice">{banner.subtitle}</p>
        ) : null}
        <HeroActions banner={banner} packagesAnchor={packagesAnchor} />
      </div>
      {product ? <HeroProductCard product={product} /> : null}
    </div>
  );
}

// Before the kelurahan uploads a banner, the hero says what the site is beside the photo placeholder (§1.3 G1).
function HeroWithoutBanner({
  description,
  packagesAnchor,
}: Pick<HeroProps, 'description' | 'packagesAnchor'>) {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <div className="space-y-5">
        <p className="text-overline text-primary-text">{siteConfig.ownerName}</p>
        <h1 className="text-display-xl text-balance">{siteConfig.name}</h1>
        <p className="text-body-lg text-pretty text-muted-foreground">{description}</p>
        <HeroActions packagesAnchor={packagesAnchor} />
      </div>
      <PhotoPlaceholder
        label={`Kegiatan di ${siteConfig.ownerName}`}
        icon={Images}
        rwIds={[]}
        className="aspect-video"
      />
    </div>
  );
}

function TrustRow({ summary }: { summary: RatingSummary }) {
  const rating = formatRating(summary.averageRating);
  return (
    <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
      <RatingStars rating={summary.averageRating} />
      <span>{copy.catalogue.ratingSummary(rating, summary.reviewCount)}</span>
    </p>
  );
}

// One banner renders as a still slide; the carousel island loads only when there is something to rotate.
function HeroSlides({ slides, description, packagesAnchor }: Omit<HeroProps, 'ratingSummary'>) {
  const rendered = slides.map(({ banner, product }, index) => (
    <HeroSlide
      key={banner.id}
      banner={banner}
      isFirst={index === 0}
      product={product}
      packagesAnchor={packagesAnchor}
    />
  ));
  const [onlySlide] = rendered;
  if (!onlySlide)
    return <HeroWithoutBanner description={description} packagesAnchor={packagesAnchor} />;
  return rendered.length === 1 ? onlySlide : <HeroCarousel slides={rendered} />;
}

export function Hero({ ratingSummary, ...slides }: HeroProps) {
  return (
    <section className="bg-linear-to-b from-brand-ice to-background pt-6 pb-10 md:pt-10 md:pb-16 dark:from-secondary">
      <Container className="space-y-6">
        <HeroSlides {...slides} />
        {ratingSummary ? <TrustRow summary={ratingSummary} /> : null}
      </Container>
    </section>
  );
}
