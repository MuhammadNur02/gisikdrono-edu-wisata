import { Camera } from 'lucide-react';

import { Container } from '@/components/layout/container';
import { ParallaxPhoto } from '@/components/marketing/parallax-photo';
import { IMAGE_SIZES } from '@/config/images';
import { homeCopy } from '@/lib/copy/home';
import type { HomeGalleryPhoto } from '@/lib/utils/home-gallery';

export interface PhotoBandProps {
  id: string;
  photo: HomeGalleryPhoto;
}

// DESIGN-SPEC §3.1 parallax photo band: a captioned gallery photo across the whole width, 640 px tall (520 on a phone),
// under the band grade, its image drifting against the scroll (CSS view timeline, ParallaxPhoto). The statement sits
// over the darkened lower left and rises 24 px into place as the band enters (§4).
export function PhotoBand({ id, photo }: PhotoBandProps) {
  const titleId = `${id}-judul`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="relative isolate overflow-hidden text-white ring-on-dark"
    >
      <ParallaxPhoto
        image={photo.image}
        sizes={IMAGE_SIZES.bleed}
        aspectClassName="h-130 md:h-160"
      />
      <div aria-hidden className="photo-grade-band absolute inset-0" />
      <Container className="absolute inset-x-0 bottom-0 pb-12 md:pb-20">
        <div className="max-w-180 space-y-4 reveal-stagger md:space-y-5">
          <p className="reveal text-eyebrow text-gold">{homeCopy.band.eyebrow}</p>
          <h2
            id={titleId}
            className="reveal text-section-title text-balance reveal-lg text-shadow-photo"
          >
            {homeCopy.band.statement}
          </h2>
          <p className="flex reveal items-center gap-2 text-body-sm text-on-dark-2">
            <Camera aria-hidden className="size-4 shrink-0" />
            {photo.caption}
          </p>
        </div>
      </Container>
    </section>
  );
}
