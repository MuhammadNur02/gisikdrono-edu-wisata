import { ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA } from '@/config/nav';
import { RW_PAGE_VOICE, rwPageCopy } from '@/lib/copy/rw-page';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { RwUnitProfile } from '@/types/rw-unit';

export interface RwCtaProps {
  id: string;
  unit: RwUnitProfile;
  // NULL for a profile-only RW: its second button leads to the map.
  packagesAnchor: string | null;
}

// DESIGN-SPEC §3.3 CTA RW: the closing forest band with the light kawung at 7 %, the RW's name in its highlight colour,
// the title and the two buttons. Like the home band it lies over the footer's top margin, so the footer's night wave
// rises straight out of it.
export function RwCta({ id, unit, packagesAnchor }: RwCtaProps) {
  const titleId = `${id}-judul`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="kawung -mb-6 bg-forest-night py-16 text-white ring-on-dark kawung-7 md:-mb-10 md:py-24 lg:-mb-14"
    >
      <Container className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-180 space-y-4 reveal-stagger">
          <p className="reveal text-eyebrow text-rw-hi">{`${unit.label} · ${unit.shortName}`}</p>
          <h2 id={titleId} className="reveal text-section-title text-balance md:text-5xl">
            {RW_PAGE_VOICE[unit.id]?.ctaTitle ?? rwPageCopy.cta.fallbackTitle(unit.shortName)}
          </h2>
        </div>
        <div className="flex reveal flex-col gap-3 sm:flex-row">
          <Button size="xl" asChild>
            <Link href={BOOKING_CTA.href}>
              {rwPageCopy.book}
              <ArrowRight data-icon="trailing" aria-hidden />
            </Link>
          </Button>
          <Button size="xl" variant="onPhoto" asChild>
            {packagesAnchor ? (
              <Link href={`#${packagesAnchor}`}>{rwPageCopy.cta.seePackages}</Link>
            ) : (
              <Link href={PUBLIC_PATHS.map}>
                <MapPin aria-hidden />
                {rwPageCopy.seeMap}
              </Link>
            )}
          </Button>
        </div>
      </Container>
    </section>
  );
}
