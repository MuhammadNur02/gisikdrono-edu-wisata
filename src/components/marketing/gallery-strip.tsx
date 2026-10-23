import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { CaptionedPhoto } from '@/components/marketing/photo';
import { SectionLink } from '@/components/marketing/section-link';
import { SnapControls } from '@/components/marketing/snap-controls';
import { IMAGE_SIZES } from '@/config/images';
import type { HomeGalleryPhoto } from '@/lib/utils/home-gallery';
import { PUBLIC_PATHS } from '@/lib/utils/paths';

export interface GalleryStripProps {
  id: string;
  photos: readonly HomeGalleryPhoto[];
}

// A full-bleed scroll-snap row of captioned photos (docs/StyleGuide.md §5.7, decision of 2026-10-23), after
// dusunbambu.id's image slideshow but without autoplay (WCAG 2.2.2) and without a carousel library: a phone swipes,
// a keyboard scrolls the focused row with the arrow keys, a mouse uses the buttons from md. The row starts and
// stops in line with the container's padding, and the next photo peeks in from the edge.
function PhotoRow({ id, photos }: GalleryStripProps) {
  return (
    <div role="region" aria-roledescription="carousel" aria-label="Galeri kegiatan">
      <ul
        id={id}
        tabIndex={0}
        className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 scrollbar-none sm:scroll-px-6 sm:px-6 lg:scroll-px-8 lg:px-8 motion-reduce:scroll-auto"
      >
        {photos.map((photo) => (
          <li key={photo.id} className="shrink-0 basis-5/6 snap-start sm:basis-1/2 lg:basis-1/3">
            <Link href={photo.href} className="block rounded-xl">
              <CaptionedPhoto
                image={photo.image}
                caption={photo.caption}
                sizes={IMAGE_SIZES.slide}
                aspectClassName="aspect-4/3"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GalleryStrip({ id, photos }: GalleryStripProps) {
  const rowId = `${id}-baris`;
  return (
    <Section
      id={id}
      eyebrow="Galeri"
      title="Suasana kegiatan di kampung"
      headerAction={
        <div className="flex items-center gap-4">
          <SnapControls targetId={rowId} />
          <SectionLink href={PUBLIC_PATHS.gallery} label="Lihat semua galeri" />
        </div>
      }
      bleed={<PhotoRow id={rowId} photos={photos} />}
    />
  );
}
