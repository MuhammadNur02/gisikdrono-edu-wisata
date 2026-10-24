import { Section } from '@/components/layout/section';
import { CARD_GRID_CLASSES } from '@/components/marketing/catalogue-list';
import { SectionLink } from '@/components/marketing/section-link';
import { PackageCard } from '@/components/packages/package-card';
import { BOOKING_CTA } from '@/config/nav';
import { cn } from '@/lib/utils/cn';
import type { PackageSummary } from '@/types/package';

export interface FeaturedPackagesProps {
  id: string;
  packages: readonly PackageSummary[];
}

// docs/PRD.md FR-PUB-04: the featured packages in the card grid of docs/StyleGuide.md §4.2, one column on a phone so
// every price stays readable. Each card fades up as it enters the screen (`reveal`, §7.3).
export function FeaturedPackages({ id, packages }: FeaturedPackagesProps) {
  return (
    <Section
      id={id}
      tone="muted"
      wave={{ variant: 'gentle' }}
      eyebrow="Paket wisata"
      title="Paket unggulan untuk rombongan Anda"
      headerAction={<SectionLink href={BOOKING_CTA.href} label="Lihat semua paket" />}
    >
      <ul className={CARD_GRID_CLASSES.listClassName}>
        {packages.map((pkg) => (
          <li key={pkg.id} className={cn(CARD_GRID_CLASSES.itemClassName, 'reveal')}>
            <PackageCard pkg={pkg} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
