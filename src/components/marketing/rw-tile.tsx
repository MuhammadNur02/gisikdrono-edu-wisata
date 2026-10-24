import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { rwAccentClasses } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import type { RwUnitProfile } from '@/types/rw-unit';

// DESIGN-SPEC §2.5 RW Tile: the title and the padding grow with the tile (large 56, base 44, medium 36, small 28;
// phones 36 / 30 / 26), the tagline 15 to 17.
const TILE_SIZES = {
  large: {
    padding: 'p-6 md:p-10',
    title: 'text-4xl md:text-6xl',
    tagline: 'text-body-md md:text-body-lg',
  },
  base: {
    padding: 'p-6 md:p-8',
    title: 'text-4xl md:text-5xl',
    tagline: 'text-body-md md:text-body-lg',
  },
  medium: { padding: 'p-6 md:p-8', title: 'text-3xl md:text-4xl', tagline: 'text-body-md' },
  small: { padding: 'p-6 md:p-7', title: 'text-2xl md:text-3xl', tagline: 'text-body-md' },
} as const;

export type RwTileSize = keyof typeof TILE_SIZES;

export interface RwTileProps {
  unit: RwUnitProfile;
  size?: RwTileSize;
  // After the RW number on the badge: `6 titik aktivitas`, `Profil kampung`. The RW's theme when left out.
  detail?: string;
  // The closing line, `Jelajahi RW 05` by default; `Kenali RW 08` for an RW that shows its profile only.
  linkLabel?: string;
  // next/image sizes for the photo: how wide the tile is at each breakpoint.
  sizes: string;
  className?: string;
}

// An RW without a usable photo is the RW's own accent field with the light kawung at 16 % (the RW 08 variant).
function TileBackground({ unit, sizes }: Pick<RwTileProps, 'unit' | 'sizes'>) {
  if (!unit.heroImage) return null;
  return (
    <>
      <PhotoFrame
        image={unit.heroImage}
        sizes={sizes}
        aspectClassName=""
        className="absolute inset-0 rounded-none"
        imageClassName="hover-zoom"
      />
      <div
        aria-hidden
        className="photo-grade-tile absolute inset-0 transition-opacity duration-300 group-hover:opacity-90"
      />
    </>
  );
}

// Card/RW Tile of DESIGN-SPEC §2.5: the RW's photo under the tile gradient, the badge on the photo, the RW's name, its
// tagline and a round arrow in the RW's accent. The whole tile opens the RW page (the title link stretches over it).
// It rises in as it comes into view (reveal reveal-lg, the caller staggers); pointed at, the photo zooms to 1.04 and
// the arrow steps up and out on the snappy spring; a press scales it to .99.
export function RwTile({ unit, size = 'base', detail, linkLabel, sizes, className }: RwTileProps) {
  const layout = TILE_SIZES[size];
  const hasPhoto = unit.heroImage !== null;
  return (
    <article
      className={cn(
        'group relative isolate flex reveal flex-col justify-end overflow-hidden rounded-xl text-white reveal-lg active:scale-99 motion-safe:transition-transform',
        rwAccentClasses(unit.accentKey).scope,
        'ring-on-dark',
        hasPhoto ? 'bg-night' : 'kawung bg-rw-fill kawung-16',
        layout.padding,
        className,
      )}
    >
      <TileBackground unit={unit} sizes={sizes} />
      <div className="relative flex flex-col gap-3.5">
        <RwTag
          rw={unit}
          detail={detail ?? unit.themeLabel}
          tone="onPhoto"
          className={hasPhoto ? undefined : 'bg-white/12'}
        />
        <TileText unit={unit} size={size} hasPhoto={hasPhoto} />
        <TileLink label={linkLabel ?? copy.catalogue.exploreRw(unit.label)} hasPhoto={hasPhoto} />
      </div>
    </article>
  );
}

function TileText({
  unit,
  size,
  hasPhoto,
}: Pick<RwTileProps, 'unit'> & { size: RwTileSize; hasPhoto: boolean }) {
  const layout = TILE_SIZES[size];
  return (
    <>
      <h3
        className={cn(
          'font-display font-extrabold tracking-tight text-balance',
          layout.title,
          'leading-none',
        )}
      >
        <Link
          href={unit.path}
          className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-white"
        >
          {unit.shortName}
        </Link>
      </h3>
      {unit.tagline ? (
        <p
          className={cn('max-w-xl', layout.tagline, hasPhoto ? 'text-on-dark-2' : 'text-on-indigo')}
        >
          {unit.tagline}
        </p>
      ) : null}
    </>
  );
}

// The closing line for sighted visitors (the title link already names the page): a round arrow in the RW's accent,
// white on the accent field of an RW without a photo.
function TileLink({ label, hasPhoto }: { label: string; hasPhoto: boolean }) {
  return (
    <span aria-hidden className="mt-1 inline-flex items-center gap-3.5 text-label font-semibold">
      <span
        className={cn(
          'flex size-11 hover-nudge-diagonal items-center justify-center rounded-full md:size-12',
          hasPhoto ? 'bg-rw-fill text-on-accent' : 'bg-white text-rw',
        )}
      >
        <ArrowUpRight className="size-5" />
      </span>
      {label}
    </span>
  );
}
