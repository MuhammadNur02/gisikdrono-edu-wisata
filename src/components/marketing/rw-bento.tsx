import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section } from '@/components/layout/section';
import { ParallaxPhoto } from '@/components/marketing/parallax-photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { Card } from '@/components/ui/card';
import { IMAGE_SIZES } from '@/config/images';
import { rwAccentClasses } from '@/config/rw';
import { RW_ICONS } from '@/config/rw-icons';
import { cn } from '@/lib/utils/cn';
import { countWord, countWordAtStart } from '@/lib/utils/number-words';
import type { RwUnitProfile } from '@/types/rw-unit';

interface TileLayout {
  span: string;
  photoAspect: string;
  sizes: string;
}

// docs/PRD.md FR-PUB-02 (amended 2026-10-23): a mosaic, the first RW by sort_order large. Below lg every tile is
// one 4:3 column; from lg one RW fills the row, two share it 7/5, three put the first beside the other two, and
// from four the first takes the row over a three-column grid. The photo's proportions follow the tile's.
const WIDE: TileLayout = {
  span: 'lg:col-span-12',
  photoAspect: 'lg:aspect-21/9',
  sizes: IMAGE_SIZES.bleed,
};
const LARGE: TileLayout = { span: 'lg:col-span-7', photoAspect: 'lg:aspect-16/10', sizes: IMAGE_SIZES.bento };
const TALL: TileLayout = {
  span: 'lg:col-span-7 lg:row-span-2',
  photoAspect: 'lg:aspect-4/5',
  sizes: IMAGE_SIZES.bento,
};
const SIDE: TileLayout = { span: 'lg:col-span-5', photoAspect: 'lg:aspect-16/10', sizes: IMAGE_SIZES.split };
const THIRD: TileLayout = { span: 'lg:col-span-4', photoAspect: 'lg:aspect-16/10', sizes: IMAGE_SIZES.card };

// Indexed by the number of RWs online; longer lists fall back to WIDE then THIRD.
const MOSAIC_LAYOUTS: readonly (readonly TileLayout[])[] = [
  [],
  [WIDE],
  [LARGE, SIDE],
  [TALL, SIDE, SIDE],
];

function tileLayout(index: number, count: number): TileLayout {
  return MOSAIC_LAYOUTS[count]?.[index] ?? (index === 0 ? WIDE : THIRD);
}

function TilePhoto({ unit, layout }: { unit: RwUnitProfile; layout: TileLayout }) {
  const aspectClassName = cn('aspect-4/3', layout.photoAspect);
  if (!unit.heroImage) {
    return (
      <PhotoPlaceholder
        label={unit.name}
        icon={RW_ICONS[unit.iconKey]}
        rws={[unit]}
        className={cn('rounded-none', aspectClassName)}
      />
    );
  }
  return (
    <ParallaxPhoto image={unit.heroImage} sizes={layout.sizes} aspectClassName={aspectClassName} />
  );
}

// The whole tile opens the RW page: the title link stretches over it, and the closing line repeats where it goes
// for sighted visitors only (§9.2). The 4 px top rule is the RW's accent fill (docs/StyleGuide.md §2.7).
function RwTile({ unit, layout }: { unit: RwUnitProfile; layout: TileLayout }) {
  return (
    <li className={cn('flex', layout.span)}>
      <Card
        variant="interactive"
        className="relative w-full gap-0 overflow-hidden py-0 md:gap-0 md:py-0"
      >
        <span aria-hidden className={cn('block h-1', rwAccentClasses(unit.accentKey).fill)} />
        <TilePhoto unit={unit} layout={layout} />
        <div className="flex flex-1 flex-col gap-3 p-5 md:p-6">
          <RwEyebrow rw={unit} withName />
          <h3 className="text-h3">
            <Link
              href={unit.path}
              className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {unit.themeLabel}
            </Link>
          </h3>
          {unit.tagline ? (
            <p className="line-clamp-2 text-body text-muted-foreground">{unit.tagline}</p>
          ) : null}
          <span
            aria-hidden
            className="mt-auto inline-flex min-h-11 items-center gap-2 text-body-sm font-medium text-primary-text"
          >
            {`Lihat halaman ${unit.label}`}
            <ArrowRight className="size-4" />
          </span>
        </div>
      </Card>
    </li>
  );
}

export interface RwBentoProps {
  id: string;
  units: readonly RwUnitProfile[];
}

// Every RW online (rw_units, sort_order). The eyebrow counts them, so it stays true as RWs go online or offline;
// with none online the section is left out whole (docs/StyleGuide.md §6.9). The desktop header's Kampung Wisata link
// points here. The tiles carry no reveal: the section starts right under the hero, inside the first screen on a
// phone. Its wave is painted over the hero's bottom edge.
export function RwBento({ id, units }: RwBentoProps) {
  if (units.length === 0) return null;
  return (
    <Section
      id={id}
      isLinkTarget
      wave={{ variant: 'bambu' }}
      eyebrow={`${countWordAtStart(units.length)} kampung, ${countWord(units.length)} program`}
      title="Pilih kampung yang ingin Anda kunjungi"
    >
      <ul className="grid gap-6 lg:grid-cols-12">
        {units.map((unit, index) => (
          <RwTile key={unit.id} unit={unit} layout={tileLayout(index, units.length)} />
        ))}
      </ul>
    </Section>
  );
}
