import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { RwTile, type RwTileSize } from '@/components/marketing/rw-tile';
import { IMAGE_SIZES } from '@/config/images';
import { BOOKING_CTA } from '@/config/nav';
import type { RwId } from '@/config/rw';
import { homeCopy } from '@/lib/copy/home';
import { cn } from '@/lib/utils/cn';
import type { RwUnitProfile } from '@/types/rw-unit';

interface TileLayout {
  span: string;
  size: RwTileSize;
  // The tile's height: 440 / 380 / 240 on phones, then the bento's 640 = 380 + 24 + 236 from lg (DESIGN-SPEC §3.1).
  height: string;
  sizes: string;
}

// docs/PRD.md FR-PUB-02 (amended 2026-10-23): a mosaic, the first RW by sort_order large. Below lg the tiles stack;
// from lg one RW fills the row, two share it 7/5, three put the first beside the other two (708 + 468 at 1200), and
// from four the first takes the row over a three-column grid.
const WIDE: TileLayout = {
  span: 'lg:col-span-12',
  size: 'large',
  height: 'min-h-110 lg:min-h-130',
  sizes: IMAGE_SIZES.bleed,
};
const LARGE: TileLayout = {
  span: 'lg:col-span-7',
  size: 'large',
  height: 'min-h-110 lg:min-h-130',
  sizes: IMAGE_SIZES.bento,
};
const TALL: TileLayout = {
  span: 'lg:col-span-7 lg:row-span-2',
  size: 'large',
  height: 'min-h-110 lg:min-h-160',
  sizes: IMAGE_SIZES.bento,
};
const SIDE: TileLayout = {
  span: 'lg:col-span-5',
  size: 'medium',
  height: 'min-h-95',
  sizes: IMAGE_SIZES.split,
};
const SIDE_LOW: TileLayout = {
  span: 'lg:col-span-5',
  size: 'small',
  height: 'min-h-60 lg:min-h-59',
  sizes: IMAGE_SIZES.split,
};
const THIRD: TileLayout = {
  span: 'lg:col-span-4',
  size: 'medium',
  height: 'min-h-95',
  sizes: IMAGE_SIZES.card,
};

// Indexed by the number of RWs online; longer lists fall back to WIDE then THIRD.
const MOSAIC_LAYOUTS: readonly (readonly TileLayout[])[] = [
  [],
  [WIDE],
  [LARGE, SIDE],
  [TALL, SIDE, SIDE_LOW],
];

function tileLayout(index: number, count: number): TileLayout {
  return MOSAIC_LAYOUTS[count]?.[index] ?? (index === 0 ? WIDE : THIRD);
}

export interface RwBentoProps {
  id: string;
  units: readonly RwUnitProfile[];
  // How many published activity points each RW has, for the badge on its tile.
  pointCounts: ReadonlyMap<RwId, number>;
  // The RWs with a package; the others show their profile only (FR-PUB-24) and say `Kenali`.
  bookableRwIds: readonly RwId[];
}

interface TileWords {
  detail: string;
  linkLabel: string;
}

// The badge counts the RW's activity points (`RW 05 · 6 titik aktivitas`); a profile-only RW says so
// instead. The large tile names the programme in its link (`Jelajahi RW 05 Ecowastreme`), the others only the RW.
function tileWords(unit: RwUnitProfile, index: number, props: RwBentoProps): TileWords {
  const isBookable = props.bookableRwIds.includes(unit.id);
  const points = props.pointCounts.get(unit.id) ?? 0;
  if (!isBookable) {
    return { detail: homeCopy.kampung.profileOnly, linkLabel: homeCopy.kampung.meet(unit.label) };
  }
  return {
    detail: points > 0 ? homeCopy.kampung.points(points) : unit.themeLabel,
    linkLabel: homeCopy.kampung.explore(index === 0 ? unit.name : unit.label),
  };
}

function CompareLink() {
  return (
    <Link
      href={BOOKING_CTA.href}
      className="group inline-flex min-h-11 items-center gap-2 rounded-md text-label-lg font-semibold text-primary-ink underline-offset-4 hover:underline"
    >
      {homeCopy.kampung.compare}
      <ArrowRight aria-hidden className="size-4.5 hover-nudge" />
    </Link>
  );
}

// Every RW online (rw_units, sort_order), DESIGN-SPEC §3.1 `Pilih kampung`. The eyebrow and title count them, so they
// stay true as RWs go online or offline; with none online the section is left out whole (docs/StyleGuide.md §6.9). The
// desktop header's Kampung Wisata link points here. The tiles rise in one after another (05, 13, 08).
export function RwBento(props: RwBentoProps) {
  const { id, units } = props;
  if (units.length === 0) return null;
  return (
    <Section
      id={id}
      isLinkTarget
      eyebrow={homeCopy.kampung.eyebrow(units.length)}
      title={homeCopy.kampung.title(units.length)}
      description={homeCopy.kampung.description}
      headerAction={<CompareLink />}
      className="pt-6 md:pt-10 lg:pt-12"
    >
      <ul className="grid gap-4 reveal-stagger md:gap-6 lg:grid-cols-12">
        {units.map((unit, index) => {
          const layout = tileLayout(index, units.length);
          return (
            <li key={unit.id} className={cn('flex', layout.span)}>
              <RwTile
                unit={unit}
                size={layout.size}
                sizes={layout.sizes}
                {...tileWords(unit, index, props)}
                className={cn('w-full', layout.height)}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
