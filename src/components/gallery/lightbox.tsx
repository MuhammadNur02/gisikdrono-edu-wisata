'use client';

import { MoveHorizontal } from 'lucide-react';
import Lightbox, { type Slide } from 'yet-another-react-lightbox';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

import type { LightboxPhoto } from '@/components/gallery/gallery-slides';
import { Badge } from '@/components/ui/badge';
import { rwAccentClasses } from '@/config/rw';
import { galleryUiCopy } from '@/lib/copy/catalogue-ui';

export interface GalleryLightboxProps {
  photos: readonly LightboxPhoto[];
  index: number;
  // The photo on screen, so closing can hand the focus back to its tile.
  onView: (index: number) => void;
  onClose: () => void;
}

const text = galleryUiCopy.lightbox;

const LABELS = {
  Previous: text.previous,
  Next: text.next,
  Close: text.close,
  Lightbox: text.viewer,
  Carousel: text.carousel,
  Slide: text.slide,
  'Photo gallery': text.photos,
  Thumbnails: text.thumbnails,
  '{index} of {total}': text.position,
};

// DESIGN-SPEC §3.7: 64 x 48 thumbnails, 12 px apart, a 2 px white edge on the one shown (the rest at 45 %).
const THUMBNAILS = {
  width: 64,
  height: 48,
  border: 2,
  borderRadius: 8,
  padding: 0,
  gap: 12,
  imageFit: 'cover',
  vignette: false,
  showToggle: false,
} as const;

// The caption block under the photo, at most 1040 px: the RW badge on the dark, the caption, the alt text, and on a
// phone the swipe hint (DESIGN-SPEC §3.7).
function PhotoCaption({ photo }: { photo: LightboxPhoto }) {
  return (
    <div className="absolute inset-x-0 bottom-0 px-5 pb-4 md:px-10 md:pb-6">
      <div className="mx-auto max-w-260 space-y-2.5 text-left">
        {photo.badge ? (
          <Badge variant="onPhoto" dot className={rwAccentClasses(photo.badge.rw.accentKey).scope}>
            {photo.badge.text}
          </Badge>
        ) : null}
        <p className="font-display text-lg leading-snug font-bold text-white md:text-2xl">
          {photo.title}
        </p>
        {photo.description ? (
          <p className="max-w-190 text-body-sm text-on-dark-2 max-md:line-clamp-2">
            {photo.description}
          </p>
        ) : null}
        <p className="flex items-center gap-2 text-caption text-on-dark-3 md:hidden">
          <MoveHorizontal aria-hidden className="size-4" />
          {galleryUiCopy.swipeHint}
        </p>
      </div>
    </div>
  );
}

// docs/StyleGuide.md §5.11, DESIGN-SPEC §3.7: the night lightbox with the counter, the circles of its controls, the
// caption block and the thumbnail strip; swipe and the arrow keys move, Esc and the backdrop close. Loaded only when a
// photo is opened (next/dynamic), so the pages do not carry it up front. The library follows prefers-reduced-motion.
export function GalleryLightbox({ photos, index, onView, onClose }: GalleryLightboxProps) {
  const footerFor = (slide: Slide) => {
    const photo = photos.find((candidate) => candidate.slide === slide);
    return photo ? <PhotoCaption photo={photo} /> : null;
  };
  return (
    <Lightbox
      open
      index={index}
      slides={photos.map((photo) => photo.slide)}
      close={onClose}
      on={{
        view: ({ index: shown }) => {
          onView(shown);
        },
      }}
      plugins={[Counter, Thumbnails]}
      thumbnails={THUMBNAILS}
      render={{ slideFooter: ({ slide }) => footerFor(slide) }}
      labels={LABELS}
      className="lightbox-theme"
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
    />
  );
}
