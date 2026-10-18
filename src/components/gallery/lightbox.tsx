'use client';

import Lightbox, { type SlideImage } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/captions.css';

import { copy } from '@/lib/copy/id';

export interface GalleryLightboxProps {
  slides: SlideImage[];
  index: number;
  // The slide on screen, so closing can hand the focus back to its tile.
  onView: (index: number) => void;
  onClose: () => void;
}

const LABELS = {
  Previous: copy.gallery.lightbox.previous,
  Next: copy.gallery.lightbox.next,
  Close: copy.gallery.lightbox.close,
  Lightbox: copy.gallery.lightbox.viewer,
  Carousel: copy.gallery.lightbox.carousel,
  Slide: copy.gallery.lightbox.slide,
  'Photo gallery': copy.gallery.lightbox.photos,
  '{index} of {total}': copy.gallery.lightbox.position,
};

// docs/StyleGuide.md §5.11: swipe and arrow keys, Esc closes, the caption under the photo. Loaded only when a
// photo is opened (next/dynamic in masonry-grid.tsx), so the gallery page does not carry it up front. The
// library follows prefers-reduced-motion on its own.
export function GalleryLightbox({ slides, index, onView, onClose }: GalleryLightboxProps) {
  return (
    <Lightbox
      open
      index={index}
      slides={slides}
      close={onClose}
      on={{
        view: ({ index: shown }) => {
          onView(shown);
        },
      }}
      plugins={[Captions]}
      captions={{ descriptionTextAlign: 'center' }}
      labels={LABELS}
      controller={{ closeOnBackdropClick: true }}
    />
  );
}
