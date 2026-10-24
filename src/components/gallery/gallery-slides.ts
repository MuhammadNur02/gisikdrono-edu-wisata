'use client';

import type { SlideImage } from 'yet-another-react-lightbox';

import { GALLERY_LIGHTBOX_WIDTHS } from '@/config/gallery';
import { IMAGE_QUALITY } from '@/config/images';
import supabaseImageLoader from '@/lib/images/supabase-loader';
import type { PublicImage } from '@/types/media';
import type { RwBadge } from '@/types/rw-unit';

// One photo of the lightbox (DESIGN-SPEC §3.7): the slide, and what its caption block says under it.
export interface LightboxPhoto {
  slide: SlideImage;
  // `RW 13 · Kampung Budaya & Seni`: the badge on the dark, in the RW's highlight; none for a kelurahan photo.
  badge: { rw: RwBadge; text: string } | null;
  // The caption in Jakarta 22/700, and under it the alt text when it says more.
  title: string;
  description: string | null;
}

// docs/StyleGuide.md §8.2: the lightbox shows a photo up to 1600 px, with smaller files for smaller screens.
export function slideFor(image: PublicImage): SlideImage {
  const urlFor = (width: number) =>
    supabaseImageLoader({ src: image.path, width, quality: IMAGE_QUALITY });
  const largest = GALLERY_LIGHTBOX_WIDTHS[GALLERY_LIGHTBOX_WIDTHS.length - 1] ?? 0;
  const slide: SlideImage = { src: urlFor(largest), alt: image.alt };
  if (!image.width || !image.height) return slide;
  const ratio = image.height / image.width;
  return {
    ...slide,
    width: image.width,
    height: image.height,
    srcSet: GALLERY_LIGHTBOX_WIDTHS.map((width) => ({
      src: urlFor(width),
      width,
      height: Math.round(width * ratio),
    })),
  };
}
