import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section } from '@/components/layout/section';
import { Photo } from '@/components/marketing/photo';
import { SectionLink } from '@/components/marketing/section-link';
import { IMAGE_SIZES } from '@/config/images';
import { RW_ICONS } from '@/config/rw-icons';
import type { RwUnitProfile } from '@/types/rw-unit';

export interface RwHighlightProps {
  id: string;
  units: readonly RwUnitProfile[];
}

function RwHighlightBlock({ unit }: { unit: RwUnitProfile }) {
  return (
    <article className="grid gap-5 sm:grid-cols-5 sm:items-center">
      <Photo
        image={unit.heroImage}
        caption={unit.name}
        placeholder={{ icon: RW_ICONS[unit.iconKey], rws: [unit] }}
        sizes={IMAGE_SIZES.split}
        aspectClassName="aspect-4/3"
        className="sm:col-span-2"
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
// Photo and text side by side rather than a row of identical cards (docs/StyleGuide.md §1.3 G7).
export function RwHighlight({ id, units }: RwHighlightProps) {
  return (
    <Section
      id={id}
      eyebrow="Dua kampung, dua program"
      title="Pilih kampung yang ingin Anda kunjungi"
    >
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
        {units.map((unit) => (
          <RwHighlightBlock key={unit.id} unit={unit} />
        ))}
      </div>
    </Section>
  );
}
