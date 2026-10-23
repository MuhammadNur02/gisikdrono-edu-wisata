import { Section } from '@/components/layout/section';
import { CARD_GRID_CLASSES } from '@/components/marketing/catalogue-list';
import { RevealList } from '@/components/marketing/reveal';
import { SectionLink } from '@/components/marketing/section-link';
import { PackageCard } from '@/components/packages/package-card';
import { BOOKING_CTA } from '@/config/nav';
import type { PackageSummary } from '@/types/package';

export interface FeaturedPackagesProps {
  id: string;
  packages: readonly PackageSummary[];
}

// docs/PRD.md FR-PUB-04: the featured packages in the card grid of docs/StyleGuide.md §4.2, one column on a phone so
// every price stays readable. The cards fade up one after another (§7.2).
export function FeaturedPackages({ id, packages }: FeaturedPackagesProps) {
  return (
    <Section
      id={id}
      tone="warm"
      wave={{ variant: 'gentle' }}
      eyebrow="Paket wisata"
      title="Paket unggulan untuk rombongan Anda"
      headerAction={<SectionLink href={BOOKING_CTA.href} label="Lihat semua paket" />}
    >
      <RevealList
        items={packages.map((pkg) => ({ key: pkg.id, node: <PackageCard pkg={pkg} /> }))}
        className={CARD_GRID_CLASSES.listClassName}
        itemClassName={CARD_GRID_CLASSES.itemClassName}
      />
    </Section>
  );
}
