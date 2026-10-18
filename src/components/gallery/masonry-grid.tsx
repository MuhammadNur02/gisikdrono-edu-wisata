'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import type { SlideImage } from 'yet-another-react-lightbox';

import { VideoTile } from '@/components/gallery/video-tile';
import { PhotoFrame } from '@/components/marketing/photo';
import { GALLERY_LIGHTBOX_WIDTHS } from '@/config/gallery';
import { IMAGE_QUALITY, IMAGE_SIZES } from '@/config/images';
import { copy } from '@/lib/copy/id';
import supabaseImageLoader from '@/lib/images/supabase-loader';
import { galleryItemAnchor } from '@/lib/utils/gallery-search';
import type { GalleryItem } from '@/types/gallery';
import type { PublicImage } from '@/types/media';

const GalleryLightbox = dynamic(
  () => import('@/components/gallery/lightbox').then((module) => module.GalleryLightbox),
  { ssr: false },
);

export interface MasonryGridProps {
  items: readonly GalleryItem[];
}

type PhotoItem = GalleryItem & { image: PublicImage };

function isPhoto(item: GalleryItem): item is PhotoItem {
  return item.youtubeId === null && item.image !== null;
}

function toSlide({ image, alt, caption }: PhotoItem): SlideImage {
  const urlFor = (width: number) =>
    supabaseImageLoader({ src: image.path, width, quality: IMAGE_QUALITY });
  const largest = GALLERY_LIGHTBOX_WIDTHS[GALLERY_LIGHTBOX_WIDTHS.length - 1] ?? 0;
  const slide: SlideImage = { src: urlFor(largest), alt, description: caption ?? alt };
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

function GalleryTile({ item, onOpen }: { item: GalleryItem; onOpen: (() => void) | null }) {
  if (item.youtubeId !== null) {
    return <VideoTile youtubeId={item.youtubeId} alt={item.alt} image={item.image} />;
  }
  if (!item.image || !onOpen) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={copy.gallery.openPhoto(item.alt)}
      className="block w-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <PhotoFrame image={item.image} sizes={IMAGE_SIZES.thumb} />
    </button>
  );
}

interface GalleryListItemProps {
  item: GalleryItem;
  position: number;
  onOpen: (() => void) | null;
  register: (element: HTMLLIElement | null) => void;
}

function GalleryListItem({ item, position, onOpen, register }: GalleryListItemProps) {
  return (
    <li
      id={galleryItemAnchor(position)}
      ref={register}
      className="mb-4 scroll-mt-24 break-inside-avoid"
    >
      <figure className="space-y-2">
        <GalleryTile item={item} onOpen={onOpen} />
        <figcaption className="text-caption text-muted-foreground">
          {item.caption ?? item.alt}
        </figcaption>
      </figure>
    </li>
  );
}

// Which photo the lightbox shows, and the tiles it hands the focus back to when it closes: the tile of the
// photo last shown, which may not be the one that opened it.
function useGalleryLightbox(photos: readonly PhotoItem[]) {
  const [openSlide, setOpenSlide] = useState<number | null>(null);
  const shownSlide = useRef(0);
  const tiles = useRef(new Map<string, HTMLLIElement>());
  return {
    openSlide,
    openerFor: (item: GalleryItem) => {
      const slide = photos.findIndex((photo) => photo.id === item.id);
      if (slide < 0) return null;
      return () => {
        shownSlide.current = slide;
        setOpenSlide(slide);
      };
    },
    registerTile: (id: string) => (element: HTMLLIElement | null) => {
      if (element) tiles.current.set(id, element);
      else tiles.current.delete(id);
    },
    onView: (slide: number) => {
      shownSlide.current = slide;
    },
    close: () => {
      setOpenSlide(null);
      const shownPhoto = photos[shownSlide.current];
      if (shownPhoto) tiles.current.get(shownPhoto.id)?.querySelector('button')?.focus();
    },
  };
}

// docs/StyleGuide.md §5.11: CSS columns keep every photo at its own proportions, and every tile carries its
// caption (§1.3 G8). Photos open in the lightbox; videos play in place.
export function MasonryGrid({ items }: MasonryGridProps) {
  const photos = items.filter(isPhoto);
  const lightbox = useGalleryLightbox(photos);
  return (
    <>
      <ul className="columns-2 gap-4 md:columns-3 lg:columns-4">
        {items.map((item, index) => (
          <GalleryListItem
            key={item.id}
            item={item}
            position={index + 1}
            onOpen={lightbox.openerFor(item)}
            register={lightbox.registerTile(item.id)}
          />
        ))}
      </ul>
      {lightbox.openSlide !== null ? (
        <GalleryLightbox
          slides={photos.map(toSlide)}
          index={lightbox.openSlide}
          onView={lightbox.onView}
          onClose={lightbox.close}
        />
      ) : null}
    </>
  );
}
