'use client';

import { Images } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState, type UIEvent } from 'react';

import { slideFor, type LightboxPhoto } from '@/components/gallery/gallery-slides';
import { PhotoFrame } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import { galleryUiCopy } from '@/lib/copy/catalogue-ui';
import { cn } from '@/lib/utils/cn';
import type { PublicImage } from '@/types/media';

const GalleryLightbox = dynamic(
  () => import('@/components/gallery/lightbox').then((module) => module.GalleryLightbox),
  { ssr: false },
);

// The bento of DESIGN-SPEC §3.5 shows four photos: the main one, one on the right, two under it.
const BENTO_SIDE = 3;
const BENTO_SIZE = 1 + BENTO_SIDE;
// The photos under the side photo start at the third of the package.
const FIRST_BELOW_INDEX = 2;

export interface PackageGalleryProps {
  images: readonly PublicImage[];
  // Named in the lightbox caption and the buttons' names.
  name: string;
}

type OpenAt = (index: number) => void;

interface TileProps {
  image: PublicImage;
  index: number;
  name: string;
  onOpen: OpenAt;
  sizes: string;
  className?: string;
  // The main photo is the page's LCP: loaded first, never animated on load.
  priority?: boolean;
  // `Lihat 6 foto` over the last tile when the package has more photos than the bento holds.
  moreCount?: number | undefined;
}

// `Lihat 6 foto`: the night layer at 60 % (72 % pointed at) with the icon rising 2 px.
function MoreOverlay({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-night/60 text-label font-semibold text-white transition-colors duration-200 group-hover:bg-night/72"
    >
      <Images className="size-6 transition-transform duration-200 group-hover:-translate-y-0.5" />
      {galleryUiCopy.morePhotos(count)}
    </span>
  );
}

function Tile({
  image,
  index,
  name,
  onOpen,
  sizes,
  className,
  priority = false,
  moreCount,
}: TileProps) {
  const label = moreCount
    ? galleryUiCopy.morePhotos(moreCount)
    : galleryUiCopy.openPhoto(image.alt || name);
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(index);
      }}
      aria-label={label}
      className={cn('group relative block overflow-hidden rounded-lg', className)}
    >
      <PhotoFrame
        image={image}
        sizes={sizes}
        aspectClassName="size-full"
        className="rounded-none"
        imageClassName="hover-zoom"
        priority={priority}
      />
      {moreCount ? <MoreOverlay count={moreCount} /> : null}
    </button>
  );
}

interface SideProps {
  // The photos after the main one, at most three; `total` is how many the package has.
  side: readonly PublicImage[];
  total: number;
  name: string;
  onOpen: OpenAt;
}

// The right column: one photo on top and, under it, the rest side by side; the last says how many there are.
function BentoSide({ side, total, name, onOpen }: SideProps) {
  const [top, ...below] = side;
  if (!top) return null;
  return (
    <div className={cn('grid gap-4', below.length > 0 && 'grid-rows-2')}>
      <Tile image={top} index={1} name={name} onOpen={onOpen} sizes={IMAGE_SIZES.split} />
      {below.length > 0 ? (
        <div className={cn('grid gap-4', below.length > 1 && 'grid-cols-2')}>
          {below.map((image, offset) => {
            const index = FIRST_BELOW_INDEX + offset;
            const isLast = index === BENTO_SIDE;
            return (
              <Tile
                key={image.path}
                image={image}
                index={index}
                name={name}
                onOpen={onOpen}
                sizes={IMAGE_SIZES.thumb}
                moreCount={isLast && total > BENTO_SIZE ? total : undefined}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// From lg: the main photo over two thirds and the side column beside it, 500 px high.
function Bento({ images, name, onOpen }: PackageGalleryProps & { onOpen: OpenAt }) {
  const [main, ...rest] = images;
  if (!main) return null;
  const side = rest.slice(0, BENTO_SIDE);
  return (
    <div className="grid h-125 grid-cols-3 gap-4 max-lg:hidden">
      <Tile
        image={main}
        index={0}
        name={name}
        onOpen={onOpen}
        sizes={IMAGE_SIZES.main}
        priority
        className={side.length > 0 ? 'col-span-2' : 'col-span-3'}
      />
      <BentoSide side={side} total={images.length} name={name} onOpen={onOpen} />
    </div>
  );
}

// Below lg: a full-width strip that swipes photo by photo, with its `1 / 6` counter. Its photos take the same `sizes`
// as the main photo, so the first one is the very file the bento preloads.
function Strip({ images, name, onOpen }: PackageGalleryProps & { onOpen: OpenAt }) {
  const [shown, setShown] = useState(0);
  const onScroll = (event: UIEvent<HTMLUListElement>) => {
    const strip = event.currentTarget;
    setShown(Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth)));
  };
  return (
    <div className="relative -mx-5 md:-mx-10 lg:hidden">
      <ul onScroll={onScroll} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto">
        {images.map((image, index) => (
          <li key={image.path} className="w-full shrink-0 snap-center">
            <Tile
              image={image}
              index={index}
              name={name}
              onOpen={onOpen}
              sizes={IMAGE_SIZES.main}
              priority={index === 0}
              className="aspect-13/10 w-full rounded-none md:aspect-video"
            />
          </li>
        ))}
      </ul>
      {images.length > 1 ? (
        <p
          aria-hidden
          className="absolute right-4 bottom-4 rounded-full bg-night/60 px-3 py-1 text-caption font-semibold text-white tabular-nums backdrop-blur-sm"
        >
          {galleryUiCopy.photoPosition(shown + 1, images.length)}
        </p>
      ) : null}
    </div>
  );
}

function photosFor(images: readonly PublicImage[], name: string): LightboxPhoto[] {
  return images.map((image) => ({
    slide: slideFor(image),
    badge: null,
    title: image.alt || name,
    description: null,
  }));
}

// DESIGN-SPEC §3.5 gallery: the bento on a wide screen, the swipe strip on a phone; every photo opens the lightbox.
export function PackageGallery({ images, name }: PackageGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <>
      <Bento images={images} name={name} onOpen={setOpenIndex} />
      <Strip images={images} name={name} onOpen={setOpenIndex} />
      {openIndex !== null ? (
        <GalleryLightbox
          photos={photosFor(images, name)}
          index={openIndex}
          onView={() => undefined}
          onClose={() => {
            setOpenIndex(null);
          }}
        />
      ) : null}
    </>
  );
}
