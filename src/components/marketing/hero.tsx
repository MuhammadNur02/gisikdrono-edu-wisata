import { Images } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { HeroProductCard } from '@/components/marketing/hero-product-card';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';
import { BOOKING_CTA } from '@/config/nav';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils/cn';
import type { HeroBanner, HeroSlideData } from '@/types/banner';
import type { ProductSummary } from '@/types/product';

// docs/StyleGuide.md §5.7, docs/PRD.md FR-PUB-01 (redesign of 2026-10-23). The photo runs edge to edge and fills
// the screen under the header from md; below md the slide keeps a stable minimum and grows with its text. A
// portrait phone loses the sides of a landscape photo, so the crop stays anchored at the top left, which keeps
// the people and the place in view (decision of 2026-10-18, for the demo hero's fan).
const SLIDE_HEIGHT = 'min-h-(--hero-min-h-mobile) md:min-h-(--hero-h)';
const SLIDE_CROP = 'object-left-top';
// §7.3: one banner is pinned like dusunbambu.id's fixed background. From md, unless the visitor asks for reduced
// motion, the photo is fixed under the header and the slide's clip-path shows only its own part, so the page
// scrolls over a still photo. The image itself never moves or transforms, so the LCP is untouched. A fixed
// layer turns absolute under any transformed ancestor, so it is never wrapped in Reveal, and a carousel (embla
// moves its slides by transform) keeps its photos in place without it.
const PINNED_SLIDE = 'md:clip-inset';
const PINNED_PHOTO = 'md:motion-safe:fixed md:motion-safe:top-16';
const SECONDARY_CTA_LABEL = 'Lihat Paket';

// The carousel and embla load only for a page that has more than one banner to rotate; the slides
// themselves are still rendered on the server (docs/StyleGuide.md §5.0, heavy islands code-split).
const HeroCarousel = dynamic(() =>
  import('@/components/marketing/hero-carousel').then((module) => module.HeroCarousel),
);

export interface HeroProps {
  slides: readonly HeroSlideData[];
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
  // Below md the pair stacks at full width, the one place a button may (§5.1).
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
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
  isPinned: boolean;
  product: ProductSummary | null;
  packagesAnchor?: string;
}

// The overlay darkens the whole photo (§8.2) and the scrim behind the text deepens it further down, so the text
// keeps AA on the lightest frame. The bottom padding clears the wave of the section below.
function HeroSlide({ banner, isFirst, isPinned, product, packagesAnchor }: HeroSlideProps) {
  const Title = isFirst ? 'h1' : 'p';
  return (
    <div className={cn('relative flex', SLIDE_HEIGHT, isPinned && PINNED_SLIDE)}>
      <PhotoFrame
        image={banner.image}
        sizes={IMAGE_SIZES.bleed}
        aspectClassName=""
        objectPositionClassName={SLIDE_CROP}
        priority={isFirst}
        className={cn('absolute inset-0 rounded-none', isPinned && PINNED_PHOTO)}
      />
      <div aria-hidden className="absolute inset-0 bg-brand-deep/60" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-brand-deep/80 to-transparent"
      />
      <Container className="relative flex flex-col justify-end gap-4 pt-24 pb-12 text-white md:pb-16 lg:pb-24">
        <p className="text-overline text-brand-ice">{siteConfig.name}</p>
        <Title className="max-w-3xl text-display-xl text-balance">{banner.title}</Title>
        {banner.subtitle ? (
          <p className="max-w-2xl text-body-lg text-pretty text-brand-ice">{banner.subtitle}</p>
        ) : null}
        <HeroActions banner={banner} packagesAnchor={packagesAnchor} />
        {product ? <HeroProductCard product={product} /> : null}
      </Container>
    </div>
  );
}

// Before the kelurahan uploads a banner, the hero says what the site is beside the photo placeholder (§1.3 G1).
function HeroWithoutBanner({
  description,
  packagesAnchor,
}: Pick<HeroProps, 'description' | 'packagesAnchor'>) {
  return (
    <Container className="grid gap-8 pt-6 pb-16 md:pt-10 md:pb-24 lg:grid-cols-2 lg:items-center">
      <div className="space-y-5">
        <p className="text-overline text-primary-text">{siteConfig.ownerName}</p>
        <h1 className="text-display-xl text-balance">{siteConfig.name}</h1>
        <p className="text-body-lg text-pretty text-muted-foreground">{description}</p>
        <HeroActions packagesAnchor={packagesAnchor} />
      </div>
      <PhotoPlaceholder
        label={`Kegiatan di ${siteConfig.ownerName}`}
        icon={Images}
        rws={[]}
        className="aspect-video"
      />
    </Container>
  );
}

// One banner renders as a still, pinned slide; the carousel island loads only when there is something to rotate.
function HeroSlides({ slides, description, packagesAnchor }: HeroProps) {
  const isPinned = slides.length === 1;
  const rendered = slides.map(({ banner, product }, index) => (
    <HeroSlide
      key={banner.id}
      banner={banner}
      isFirst={index === 0}
      isPinned={isPinned}
      product={product}
      packagesAnchor={packagesAnchor}
    />
  ));
  const [onlySlide] = rendered;
  if (!onlySlide)
    return <HeroWithoutBanner description={description} packagesAnchor={packagesAnchor} />;
  return isPinned ? onlySlide : <HeroCarousel slides={rendered} />;
}

// Nothing in the hero animates: not the h1, not the first image, and no Reveal around it (§7.3).
export function Hero(props: HeroProps) {
  return (
    <section className="bg-linear-to-b from-brand-ice to-background dark:from-secondary">
      <HeroSlides {...props} />
    </section>
  );
}
