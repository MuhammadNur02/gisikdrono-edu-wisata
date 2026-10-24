import { Section } from '@/components/layout/section';
import { RwTile, type RwTileSize } from '@/components/marketing/rw-tile';
import { IMAGE_SIZES } from '@/config/images';
import { cn } from '@/lib/utils/cn';
import { countWord, countWordAtStart } from '@/lib/utils/number-words';
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
}

// Every RW online (rw_units, sort_order). The eyebrow counts them, so it stays true as RWs go online or offline;
// with none online the section is left out whole (docs/StyleGuide.md §6.9). The desktop header's Kampung Wisata link
// points here. The tiles rise in one after another (05, 13, 08) as they come into view.
export function RwBento({ id, units }: RwBentoProps) {
  if (units.length === 0) return null;
  return (
    <Section
      id={id}
      isLinkTarget
      eyebrow={`${countWordAtStart(units.length)} kampung, ${countWord(units.length)} program`}
      title="Pilih kampung yang ingin Anda kunjungi"
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
                className={cn('w-full', layout.height)}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
