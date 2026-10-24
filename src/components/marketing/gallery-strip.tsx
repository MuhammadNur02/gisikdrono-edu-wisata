import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { MarqueeToggle } from '@/components/marketing/marquee-toggle';
import { PhotoFrame } from '@/components/marketing/photo';
import { Button } from '@/components/ui/button';
import { homeCopy } from '@/lib/copy/home';
import { cn } from '@/lib/utils/cn';
import type { HomeGalleryPhoto } from '@/lib/utils/home-gallery';
import { PUBLIC_PATHS } from '@/lib/utils/paths';

export interface GalleryStripProps {
  id: string;
  photos: readonly HomeGalleryPhoto[];
}

// A photo 360 px tall (230 on a phone) at its own proportions, so the widths vary along the row as the design's do;
// 360 px of height never asks a low-resolution source for more than about 500 px of width.
const PHOTO_SIZES = '(min-width: 768px) 540px, 320px';

// One lap of the track. The copy is hidden from assistive technology and out of the tab order, so each photo is
// announced and focused once.
function PhotoSet({ photos, isCopy }: { photos: readonly HomeGalleryPhoto[]; isCopy: boolean }) {
  return (
    <ul aria-hidden={isCopy || undefined} className="flex gap-4 pr-4 md:gap-5 md:pr-5">
      {photos.map((photo) => (
        <li key={photo.id} className="shrink-0">
          <Link
            href={photo.href}
            tabIndex={isCopy ? -1 : undefined}
            className="group block space-y-3 rounded-lg"
          >
            <PhotoFrame
              image={photo.image}
              sizes={PHOTO_SIZES}
              className="h-57.5 w-auto md:h-90"
              imageClassName="transition-transform duration-700 ease-out-soft motion-safe:group-hover:scale-105"
            />
            <span className="block max-w-80 truncate text-body-sm text-muted-foreground">
              {photo.caption}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Controls({ marqueeId, className }: { marqueeId: string; className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      <MarqueeToggle targetId={marqueeId} label={homeCopy.gallery.pause} />
      <Button variant="outline" asChild className="max-md:flex-1">
        <Link href={PUBLIC_PATHS.gallery}>
          {homeCopy.gallery.open}
          <ArrowRight data-icon="trailing" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

// DESIGN-SPEC §3.1 `Galeri strip` and §4: the captioned photos run right to left in a continuous marquee bleeding off
// both edges, 60 s a lap (45 s on a phone), CSS only. It stops while pointed at or focused and with the Jeda toggle;
// under reduced motion it does not move and scrolls by hand instead.
export function GalleryStrip({ id, photos }: GalleryStripProps) {
  const marqueeId = `${id}-marquee`;
  const marquee = (
    <div
      id={marqueeId}
      role="region"
      aria-label={homeCopy.gallery.rowLabel}
      className="marquee pl-5 md:-ml-38 md:pl-0"
    >
      <div className="marquee-track">
        <PhotoSet photos={photos} isCopy={false} />
        <PhotoSet photos={photos} isCopy />
      </div>
    </div>
  );
  return (
    <Section
      id={id}
      eyebrow={homeCopy.gallery.eyebrow}
      title={homeCopy.gallery.title}
      description={homeCopy.gallery.description}
      headerAction={<Controls marqueeId={marqueeId} className="max-md:hidden" />}
      bleed={
        <>
          {marquee}
          <Controls marqueeId={marqueeId} className="mx-5 mt-8 md:hidden" />
        </>
      }
    />
  );
}
