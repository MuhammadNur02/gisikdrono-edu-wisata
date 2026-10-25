import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { PhotoFrame } from '@/components/marketing/photo';
import { Button } from '@/components/ui/button';
import { galleryFilterForRw } from '@/config/gallery';
import { rwPageCopy } from '@/lib/copy/rw-page';
import { cn } from '@/lib/utils/cn';
import { galleryPath } from '@/lib/utils/gallery-search';
import type { RwGalleryPhoto } from '@/lib/utils/rw-photos';
import type { RwUnitProfile } from '@/types/rw-unit';

// The mosaic: the big tile, then two columns of two (DESIGN-SPEC §3.3); a phone shows the big tile and a row of two.
// Three photos make the big tile and one column; fewer sit side by side.
const MOSAIC_TILES = 5;
const PHONE_TILES = 3;
const MOSAIC_COLUMNS = [
  '',
  'grid-cols-1',
  'grid-cols-2',
  'grid-cols-2 md:grid-cols-3',
  'grid-cols-2 md:grid-cols-3',
  'grid-cols-2 md:grid-cols-4',
];

function tileCountFor(photoCount: number): number {
  if (photoCount >= MOSAIC_TILES) return MOSAIC_TILES;
  return photoCount >= PHONE_TILES ? PHONE_TILES : photoCount;
}
const TILE_CLASSES = [
  'col-span-2 row-span-2 md:col-span-2',
  '',
  '',
  'max-md:hidden',
  'max-md:hidden',
] as const;

export interface RwGalleryProps {
  id: string;
  unit: RwUnitProfile;
  photos: readonly RwGalleryPhoto[];
}

interface TileProps {
  photo: RwGalleryPhoto;
  index: number;
  href: string;
  // Photos the mosaic leaves out, written on its last tile (`+2 foto lainnya`): on a phone and from md.
  more: { phone: number; wide: number };
  // Three photos or more: the big tile and its columns; fewer sit side by side.
  isMosaic: boolean;
}

function MoreOverlay({ count, className }: { count: number; className: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'absolute inset-0 flex-col items-center justify-center bg-forest-night/70 text-white',
        className,
      )}
    >
      <span className="font-display text-3xl font-extrabold">+{count}</span>
      <span className="text-caption">{rwPageCopy.gallery.more}</span>
    </span>
  );
}

// Each tile opens the RW's gallery. It unveils from an 8 % inset as it enters and its photo zooms when pointed at (§4).
function MosaicTile({ photo, index, href, more, isMosaic }: TileProps) {
  const isBig = index === 0 && isMosaic;
  return (
    <li className={cn('reveal-clip', isMosaic && TILE_CLASSES[index])}>
      <Link href={href} className="group relative block size-full overflow-hidden rounded-xl">
        <PhotoFrame
          image={photo.image}
          sizes={isBig ? '(min-width: 768px) 590px, 100vw' : '(min-width: 768px) 290px, 50vw'}
          aspectClassName=""
          className="absolute inset-0 rounded-none"
          imageClassName="hover-zoom"
        />
        {isBig ? (
          <span className="absolute inset-x-4 bottom-4 w-fit truncate rounded-md bg-night/60 px-3 py-1.5 text-caption text-white backdrop-blur-sm">
            {photo.caption}
          </span>
        ) : (
          <span className="sr-only">{photo.caption}</span>
        )}
        <MoreOverlay count={more.phone} className="flex md:hidden" />
        <MoreOverlay count={more.wide} className="hidden md:flex" />
      </Link>
    </li>
  );
}

function OpenGallery({
  unit,
  href,
  className,
}: {
  unit: RwUnitProfile;
  href: string;
  className?: string;
}) {
  return (
    <Button variant="outline" asChild className={className}>
      <Link href={href}>
        {rwPageCopy.gallery.open(unit.label)}
        <ArrowRight data-icon="trailing" aria-hidden />
      </Link>
    </Button>
  );
}

// DESIGN-SPEC §3.3 Galeri (#galeri): a mosaic 560 px tall, the last tile counting the photos it leaves out.
export function RwGallery({ id, unit, photos }: RwGalleryProps) {
  const href = galleryPath({ filter: galleryFilterForRw(unit.id), page: 1 });
  const shown = photos.slice(0, tileCountFor(photos.length));
  const lastIndex = shown.length - 1;
  return (
    <Section
      id={id}
      tone="muted"
      eyebrow={rwPageCopy.gallery.eyebrow(unit.label)}
      title={rwPageCopy.gallery.title}
      description={rwPageCopy.gallery.description(unit.shortName)}
      headerAction={<OpenGallery unit={unit} href={href} className="max-md:hidden" />}
      className="scroll-mt-header-nav"
    >
      <ul
        className={cn(
          'grid h-100 gap-3 reveal-stagger md:h-140 md:gap-4',
          shown.length >= PHONE_TILES ? 'grid-rows-3 md:grid-rows-2' : 'grid-rows-1',
          MOSAIC_COLUMNS[shown.length],
        )}
      >
        {shown.map((photo, index) => (
          <MosaicTile
            key={photo.id}
            photo={photo}
            index={index}
            href={href}
            isMosaic={shown.length >= PHONE_TILES}
            more={{
              phone: index === PHONE_TILES - 1 ? photos.length - PHONE_TILES : 0,
              wide: index === lastIndex ? photos.length - shown.length : 0,
            }}
          />
        ))}
      </ul>
      <OpenGallery unit={unit} href={href} className="w-full md:hidden" />
    </Section>
  );
}
