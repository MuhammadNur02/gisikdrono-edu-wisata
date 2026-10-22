import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section } from '@/components/layout/section';
import { Photo } from '@/components/marketing/photo';
import { SectionLink } from '@/components/marketing/section-link';
import { IMAGE_SIZES } from '@/config/images';
import { RW_ICONS } from '@/config/rw-icons';
import { cn } from '@/lib/utils/cn';
import { countWord, countWordAtStart } from '@/lib/utils/number-words';
import type { RwUnitProfile } from '@/types/rw-unit';

// The photo sits left, then right, then left again: two sides to alternate between.
const PHOTO_SIDES = 2;

export interface RwHighlightProps {
  id: string;
  units: readonly RwUnitProfile[];
}

function RwHighlightBlock({ unit, photoLast }: { unit: RwUnitProfile; photoLast: boolean }) {
  return (
    <article className="grid gap-5 sm:grid-cols-5 sm:items-center sm:gap-8">
      <Photo
        image={unit.heroImage}
        caption={unit.name}
        placeholder={{ icon: RW_ICONS[unit.iconKey], rws: [unit] }}
        sizes={IMAGE_SIZES.split}
        aspectClassName="aspect-4/3"
        className={cn('sm:col-span-2', photoLast && 'sm:order-last')}
      />
      <div className="space-y-3 sm:col-span-3">
        <RwEyebrow rw={unit} withName />
        <h3 className="text-h3">{unit.themeLabel}</h3>
        {unit.tagline ? <p className="text-body text-muted-foreground">{unit.tagline}</p> : null}
        <SectionLink href={unit.path} label={`Lihat halaman ${unit.label}`} />
      </div>
    </article>
  );
}

// docs/PRD.md FR-PUB-02: every RW online from rw_units (name, theme, tagline, photo), each linking to its page.
// One RW to a row, photo and text alternating sides, rather than a row of identical cards (docs/StyleGuide.md §1.3
// G7); the eyebrow counts the RWs, so it stays true as RWs go online or offline. With none online the section is
// left out whole (docs/StyleGuide.md §6.9). The desktop header's Kampung Wisata link points here.
export function RwHighlight({ id, units }: RwHighlightProps) {
  if (units.length === 0) return null;
  return (
    <Section
      id={id}
      isLinkTarget
      eyebrow={`${countWordAtStart(units.length)} kampung, ${countWord(units.length)} program`}
      title="Pilih kampung yang ingin Anda kunjungi"
    >
      <div className="grid gap-12">
        {units.map((unit, index) => (
          <RwHighlightBlock key={unit.id} unit={unit} photoLast={index % PHOTO_SIDES === 1} />
        ))}
      </div>
    </Section>
  );
}
