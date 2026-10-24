import { Images } from 'lucide-react';
import dynamic from 'next/dynamic';

import { Container } from '@/components/layout/container';
import { HeroProductCard } from '@/components/marketing/hero-product-card';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { IMAGE_SIZES } from '@/config/images';
import { HOME_HERO_STATEMENT } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { HeroBanner, HeroSlideData } from '@/types/banner';
import type { ProductSummary } from '@/types/product';

// docs/StyleGuide.md §5.7, docs/PRD.md FR-PUB-01 (redesign of 2026-10-24, after dusunbambu.id). The photo runs edge
// to edge and fills the screen under the header from md, toned down and quiet, with one short statement in the
// middle; the introduction, the address and the two buttons sit under it (HomeIntro), so nothing else crowds the
// photo. Below md the slide keeps a stable minimum height, and the centred crop keeps the street in view.
const SLIDE_HEIGHT = 'h-svh min-h-(--hero-min-h-mobile) max-h-(--hero-max-h)';
// DESIGN-SPEC §1.7: the crop sits a little left of centre, 45 % on desktop and 42 % on phones.
const SLIDE_CROP = 'object-hero';
// §7.3: one banner is pinned like dusunbambu.id's fixed background. From md, unless the visitor asks for reduced
// motion, the photo is fixed under the header and the slide's clip-path shows only its own part, so the page
// scrolls over a still photo. The image itself never moves or transforms, so the LCP is untouched. A fixed
// layer turns absolute under any transformed ancestor, so it is never wrapped in Reveal, and a carousel (embla
// moves its slides by transform) keeps its photos in place without it.
const PINNED_SLIDE = 'md:clip-inset';
const PINNED_PHOTO = 'md:motion-safe:fixed md:motion-safe:top-0 md:motion-safe:h-svh';

// The carousel and embla load only for a page that has more than one banner to rotate; the slides
// themselves are still rendered on the server (docs/StyleGuide.md §5.0, heavy islands code-split).
const HeroCarousel = dynamic(() =>
  import('@/components/marketing/hero-carousel').then((module) => module.HeroCarousel),
);

export interface HeroProps {
  slides: readonly HeroSlideData[];
  // site_settings `seo.default_description`, for the hero shown before any banner exists.
  description: string;
}

interface HeroSlideProps {
  banner: HeroBanner;
  // Only the first slide carries the page's h1 and the LCP image (§5.7, §8.2).
  isFirst: boolean;
  isPinned: boolean;
  product: ProductSummary | null;
}

// DESIGN-SPEC §3.1: the scroll cue, a dot running down a 44 px track under GULIR, just above the arc. Decorative.
function ScrollCue() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 bottom-20 flex flex-col items-center gap-2 text-white/70 max-md:hidden lg:bottom-32"
    >
      <span className="text-meta-caps">{copy.layout.scrollCue}</span>
      <span className="relative h-11 w-px bg-white/30">
        <span className="absolute top-0 -left-1.5 size-3.5 scroll-cue rounded-full bg-white/80" />
      </span>
    </div>
  );
}

// The tone and the veil darken the whole photo (§8.2), so the light statement keeps AA on the brightest frame. The
// bottom padding clears the arc of the introduction below, which is painted over the photo's lower edge.
function HeroSlide({ banner, isFirst, isPinned, product }: HeroSlideProps) {
  const Statement = isFirst ? 'h1' : 'p';
  return (
    <div className={cn('relative flex', SLIDE_HEIGHT, isPinned && PINNED_SLIDE)}>
      <PhotoFrame
        image={banner.image}
        sizes={IMAGE_SIZES.bleed}
        aspectClassName=""
        objectPositionClassName={SLIDE_CROP}
        priority={isFirst}
        className={cn('absolute inset-0 rounded-none', isPinned && PINNED_PHOTO)}
        imageClassName="photo-tone-hero"
      />
      <div aria-hidden className="photo-grade-hero absolute inset-0" />
      <Container className="relative flex flex-col items-center justify-center gap-4 pt-(--header-h-overlay) pb-24 text-center text-white md:gap-5.5 md:pb-32">
        <p className="text-hero-lead text-pretty text-white/90 text-shadow-photo">
          {HOME_HERO_STATEMENT.lead}
        </p>
        <Statement className="text-hero-statement text-balance text-shadow-photo-lg">
          {HOME_HERO_STATEMENT.title}
        </Statement>
        {product ? <HeroProductCard product={product} /> : null}
      </Container>
      {isFirst ? <ScrollCue /> : null}
    </div>
  );
}

// Before the kelurahan uploads a banner, the hero says what the site is beside the photo placeholder (§1.3 G1).
function HeroWithoutBanner({ description }: Pick<HeroProps, 'description'>) {
  return (
    <Container className="grid gap-8 pt-6 pb-16 md:pt-10 md:pb-24 lg:grid-cols-2 lg:items-center">
      <div className="space-y-5">
        <p className="text-overline text-primary-text">{HOME_HERO_STATEMENT.lead}</p>
        <h1 className="text-display text-balance">{HOME_HERO_STATEMENT.title}</h1>
        <p className="text-body-lg text-pretty text-muted-foreground">{description}</p>
      </div>
      <PhotoPlaceholder
        label={`Kegiatan di ${HOME_HERO_STATEMENT.title}`}
        icon={Images}
        rws={[]}
        className="aspect-video"
      />
    </Container>
  );
}

// One banner renders as a still, pinned slide; the carousel island loads only when there is something to rotate.
function HeroSlides({ slides, description }: HeroProps) {
  const isPinned = slides.length === 1;
  const rendered = slides.map(({ banner, product }, index) => (
    <HeroSlide
      key={banner.id}
      banner={banner}
      isFirst={index === 0}
      isPinned={isPinned}
      product={product}
    />
  ));
  const [onlySlide] = rendered;
  if (!onlySlide) return <HeroWithoutBanner description={description} />;
  return isPinned ? onlySlide : <HeroCarousel slides={rendered} />;
}

// Nothing in the hero animates: not the h1, not the first image, and no Reveal around it (§7.3). A photo hero carries
// data-header-overlay, so the site header lies over it, transparent and white, until the visitor scrolls (§2.7).
export function Hero(props: HeroProps) {
  const hasPhoto = props.slides.length > 0;
  return (
    <section
      data-header-overlay={hasPhoto ? '' : undefined}
      className="bg-linear-to-b from-brand-ice to-background"
    >
      <HeroSlides {...props} />
    </section>
  );
}
