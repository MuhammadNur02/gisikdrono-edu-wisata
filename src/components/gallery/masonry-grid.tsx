'use client';

import { Maximize2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

import { slideFor, type LightboxPhoto } from '@/components/gallery/gallery-slides';
import { VideoTile } from '@/components/gallery/video-tile';
import { PhotoFrame } from '@/components/marketing/photo';
import { Badge } from '@/components/ui/badge';
import { IMAGE_SIZES } from '@/config/images';
import { rwAccentClasses } from '@/config/rw';
import { GALLERY_CATEGORY_LABELS } from '@/config/status';
import { galleryUiCopy } from '@/lib/copy/catalogue-ui';
import { galleryItemAnchor } from '@/lib/utils/gallery-search';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { GalleryItem } from '@/types/gallery';
import type { PublicImage } from '@/types/media';
import type { RwBadge, RwUnitSummary } from '@/types/rw-unit';

const GalleryLightbox = dynamic(
  () => import('@/components/gallery/lightbox').then((module) => module.GalleryLightbox),
  { ssr: false },
);

export interface MasonryGridProps {
  items: readonly GalleryItem[];
  // The RWs online: the badge of a tile and of its lightbox caption names the RW. Left out, the badges name the
  // category alone.
  rws?: readonly RwUnitSummary[];
}

type PhotoItem = GalleryItem & { image: PublicImage };

function isPhoto(item: GalleryItem): item is PhotoItem {
  return item.youtubeId === null && item.image !== null;
}

// The tile's RW from its own rw_id, so a page that passes no `rws` still names it (`RW 05`); the RWs passed add the
// accent of its dot and the programme name of the lightbox badge.
function rwOf(item: GalleryItem, rws: readonly RwUnitSummary[]): TileRw | null {
  if (item.rwId === null) return null;
  const unit = rws.find((rw) => rw.id === item.rwId);
  return { badge: rwBadgeFor(item.rwId, rws), shortName: unit?.shortName ?? null };
}

interface TileRw {
  badge: RwBadge;
  shortName: string | null;
}

// `RW 05 · UMKM` on a tile: the RW's number and the category; a kelurahan photo shows the category alone.
function tileBadgeText(item: GalleryItem, rw: TileRw | null): string {
  const category = GALLERY_CATEGORY_LABELS[item.category];
  return rw ? `${rw.badge.label} · ${category}` : category;
}

function toLightboxPhoto(item: PhotoItem, rws: readonly RwUnitSummary[]): LightboxPhoto {
  const rw = rwOf(item, rws);
  const title = item.caption ?? item.alt;
  const badgeText = rw?.shortName ? `${rw.badge.label} · ${rw.shortName}` : rw?.badge.label;
  return {
    slide: slideFor(item.image),
    badge: rw && badgeText ? { rw: rw.badge, text: badgeText } : null,
    title,
    description: item.alt === title ? null : item.alt,
  };
}

// The hover and focus state of DESIGN-SPEC §3.7: the night gradient from 40 %, the zoom button springing in at the top
// right, the badge and the caption rising 8 px. Decorative: the button's own name already says it all.
function TileOverlay({ item, rw }: { item: GalleryItem; rw: TileRw | null }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg">
      <span className="absolute inset-0 rounded-lg bg-linear-to-t from-night/85 via-night/25 via-60% to-transparent opacity-0 transition-opacity duration-240 ease-out-soft group-hover:opacity-100 group-focus-visible:opacity-100" />
      <span className="absolute top-3.5 right-3.5 flex size-10 scale-80 items-center justify-center rounded-full bg-white text-night opacity-0 transition duration-300 ease-spring-snappy group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
        <Maximize2 className="size-4.5" />
      </span>
      <span className="absolute inset-x-4 bottom-4 flex translate-y-2 flex-col items-start gap-2 text-left opacity-0 transition duration-300 ease-out-soft group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
        <Badge variant="onPhoto" dot className={rwAccentClasses(rw?.badge.accentKey ?? null).scope}>
          {tileBadgeText(item, rw)}
        </Badge>
        <span className="text-body-md leading-snug font-semibold text-white">
          {item.caption ?? item.alt}
        </span>
      </span>
    </span>
  );
}

function PhotoTile({
  item,
  rw,
  onOpen,
}: {
  item: PhotoItem;
  rw: TileRw | null;
  onOpen: () => void;
}) {
  return (
    <figure className="space-y-2">
      <button
        type="button"
        onClick={onOpen}
        aria-label={galleryUiCopy.openPhoto(item.alt)}
        className="group relative block w-full rounded-lg transition-shadow duration-300 hover:shadow-md focus-visible:shadow-md"
      >
        <PhotoFrame image={item.image} sizes={IMAGE_SIZES.thumb} imageClassName="hover-zoom" />
        <TileOverlay item={item} rw={rw} />
      </button>
      {/* On a touch screen there is no hover, so the caption stays under the photo (docs/StyleGuide.md §1.3 G8). */}
      <figcaption className="text-caption text-muted-foreground lg:sr-only">
        {item.caption ?? item.alt}
      </figcaption>
    </figure>
  );
}

// Which photo the lightbox shows, and the tiles it hands the focus back to when it closes: the tile of the photo
// last shown, which may not be the one that opened it.
function useGalleryLightbox(photos: readonly PhotoItem[]) {
  const [openSlide, setOpenSlide] = useState<number | null>(null);
  const shownSlide = useRef(0);
  const tiles = useRef(new Map<string, HTMLLIElement>());
  return {
    openSlide,
    open: (item: PhotoItem) => {
      shownSlide.current = Math.max(0, photos.indexOf(item));
      setOpenSlide(shownSlide.current);
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

// A video plays in place, with its caption under it.
function VideoItem({ item }: { item: GalleryItem }) {
  if (item.youtubeId === null) return null;
  return (
    <figure className="space-y-2">
      <VideoTile youtubeId={item.youtubeId} alt={item.alt} image={item.image} />
      <figcaption className="text-caption text-muted-foreground">
        {item.caption ?? item.alt}
      </figcaption>
    </figure>
  );
}

// docs/StyleGuide.md §5.11, DESIGN-SPEC §3.7: CSS columns (4 from lg, 3 from md, 2 on phones; 24 px apart, 12 on
// phones) keep every photo at its own proportions; each tile fades in as it comes into view. Photos open in the
// lightbox; videos play in place.
const NO_RWS: readonly RwUnitSummary[] = [];

export function MasonryGrid({ items, rws = NO_RWS }: MasonryGridProps) {
  const photos = items.filter(isPhoto);
  const lightbox = useGalleryLightbox(photos);
  return (
    <>
      <ul className="columns-2 gap-3 md:columns-3 md:gap-6 lg:columns-4">
        {items.map((item, index) => (
          <li
            key={item.id}
            id={galleryItemAnchor(index + 1)}
            ref={lightbox.registerTile(item.id)}
            className="mb-3 reveal scroll-mt-24 break-inside-avoid md:mb-6"
          >
            {isPhoto(item) ? (
              <PhotoTile
                item={item}
                rw={rwOf(item, rws)}
                onOpen={() => {
                  lightbox.open(item);
                }}
              />
            ) : (
              <VideoItem item={item} />
            )}
          </li>
        ))}
      </ul>
      {lightbox.openSlide !== null ? (
        <GalleryLightbox
          photos={photos.map((photo) => toLightboxPhoto(photo, rws))}
          index={lightbox.openSlide}
          onView={lightbox.onView}
          onClose={lightbox.close}
        />
      ) : null}
    </>
  );
}
