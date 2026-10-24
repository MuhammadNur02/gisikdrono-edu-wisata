import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Container } from '@/components/layout/container';
import { RwTag } from '@/components/layout/rw-tag';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { PhotoFrame } from '@/components/marketing/photo';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';
import { BOOKING_CTA, HOME_NAV_ITEM, HOME_RW_SECTION_ID } from '@/config/nav';
import { copy } from '@/lib/copy/id';
import { rwPageCopy } from '@/lib/copy/rw-page';
import { breadcrumbListJsonLd, type BreadcrumbItem } from '@/lib/seo/json-ld';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { RwUnitProfile } from '@/types/rw-unit';

export interface RwHeroProps {
  unit: RwUnitProfile;
  // An RW without a package shows its profile only (FR-PUB-24): its buttons lead to the map and to WhatsApp.
  isBookable: boolean;
  packagesAnchor: string;
  chatUrl: string;
}

const KAMPUNG_PATH = `${HOME_NAV_ITEM.href}#${HOME_RW_SECTION_ID}`;

// §7.3: like the home hero, the photo is pinned from md (fixed inside its clipped section) so the page scrolls over a
// still photo; it never moves or scales, so the LCP is untouched. A night layer deepens it to 40 % with the scroll.
const PINNED_PHOTO = 'md:motion-safe:fixed md:motion-safe:top-0 md:motion-safe:h-svh';

function trailOf(unit: RwUnitProfile): BreadcrumbItem[] {
  return [
    { name: HOME_NAV_ITEM.label, path: HOME_NAV_ITEM.href },
    { name: rwPageCopy.breadcrumbParent, path: KAMPUNG_PATH },
    { name: unit.name, path: unit.path },
  ];
}

// `Beranda › Kampung Wisata › RW 05 Ecowastreme`; a phone shows only the way back, `‹ Kampung Wisata`.
function Breadcrumbs({ trail }: { trail: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label={copy.layout.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1.5 text-body-sm text-white/70">
        {trail.slice(0, -1).map((item, index) => (
          <li
            key={item.path}
            className={
              index === 0 ? 'flex items-center gap-1.5 max-md:hidden' : 'flex items-center gap-1.5'
            }
          >
            <ChevronLeft aria-hidden className="size-4 md:hidden" />
            <Link
              href={item.path}
              className="rounded-sm underline-offset-4 hover:text-white hover:underline"
            >
              {item.name}
            </Link>
            <ChevronRight aria-hidden className="size-4 max-md:hidden" />
          </li>
        ))}
        <li aria-current="page" className="font-semibold text-white max-md:hidden">
          {trail.at(-1)?.name}
        </li>
      </ol>
    </nav>
  );
}

function HeroActions({ isBookable, packagesAnchor, unit, chatUrl }: RwHeroProps) {
  if (!isBookable) {
    return (
      <>
        <Button size="lg" asChild className="max-md:w-full">
          <Link href={PUBLIC_PATHS.map}>
            <MapPin aria-hidden />
            {rwPageCopy.seeMap}
          </Link>
        </Button>
        <Button size="lg" variant="onPhoto" asChild className="max-md:w-full">
          <a href={chatUrl} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-5" />
            {copy.layout.whatsAppChat}
          </a>
        </Button>
      </>
    );
  }
  return (
    <>
      <Button size="lg" asChild className="max-md:w-full">
        <Link href={BOOKING_CTA.href}>
          {rwPageCopy.book}
          <ArrowRight data-icon="trailing" aria-hidden />
        </Link>
      </Button>
      <Button size="lg" variant="onPhoto" asChild className="max-md:hidden">
        <Link href={`#${packagesAnchor}`}>
          {rwPageCopy.seePackages(unit.label)}
          <ArrowDown aria-hidden />
        </Link>
      </Button>
    </>
  );
}

// The RW's photo under its grade, or for an RW without a usable photo (RW 08, DESIGN-SPEC §0) its accent field with
// the light kawung at 14 %.
function HeroBackground({ unit }: { unit: RwUnitProfile }): ReactNode {
  if (!unit.heroImage) return null;
  return (
    <>
      <PhotoFrame
        image={unit.heroImage}
        sizes={IMAGE_SIZES.bleed}
        aspectClassName=""
        priority
        className={`absolute inset-0 rounded-none ${PINNED_PHOTO}`}
        imageClassName="photo-tone-rw"
      />
      <div aria-hidden className="photo-grade-rw absolute inset-0" />
      <div aria-hidden className="absolute inset-0 hero-scroll-dim bg-night hero-dim-rw" />
    </>
  );
}

// DESIGN-SPEC §3.3 hero: 680 px (640 on a phone), the transparent header over it, the content on the lower left:
// breadcrumb, the on-photo badge, the RW's programme name as the h1, its tagline and the buttons. Nothing in it
// animates on load (§4: part of the LCP area).
export function RwHero(props: RwHeroProps) {
  const { unit } = props;
  const trail = trailOf(unit);
  const hasPhoto = unit.heroImage !== null;
  return (
    <section
      data-header-overlay=""
      className={
        hasPhoto
          ? 'relative isolate flex h-160 bg-night text-white ring-on-dark clip-inset md:h-170'
          : 'kawung relative isolate flex h-160 bg-rw-fill text-white ring-on-dark kawung-14 md:h-170'
      }
    >
      <HeroBackground unit={unit} />
      <Container className="relative flex flex-col justify-end gap-5 pt-(--header-h-overlay) pb-12 md:pb-18">
        <div className="max-w-215 space-y-5">
          <Breadcrumbs trail={trail} />
          <RwTag
            rw={unit}
            detail={unit.themeLabel}
            tone="onPhoto"
            className={hasPhoto ? undefined : 'bg-white/12'}
          />
          <h1 className="text-display-rw text-balance text-shadow-photo-lg">{unit.shortName}</h1>
          {unit.tagline ? (
            <p className="max-w-180 text-body-lg text-pretty text-white/90 text-shadow-photo md:text-xl">
              {unit.tagline}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1">
            <HeroActions {...props} />
          </div>
        </div>
      </Container>
      <JsonLd data={breadcrumbListJsonLd(trail)} />
    </section>
  );
}
