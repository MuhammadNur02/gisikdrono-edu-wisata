import { Section } from '@/components/layout/section';
import { SectionLink } from '@/components/marketing/section-link';
import { PackageGrid } from '@/components/packages/package-grid';
import { BOOKING_CTA } from '@/config/nav';
import type { PackageSummary } from '@/types/package';

export interface FeaturedPackagesProps {
  id: string;
  packages: readonly PackageSummary[];
}

export function FeaturedPackages({ id, packages }: FeaturedPackagesProps) {
  return (
    <Section id={id} eyebrow="Paket wisata" title="Paket unggulan" tone="muted">
      <PackageGrid packages={packages} />
      <SectionLink href={BOOKING_CTA.href} label="Lihat semua paket" />
    </Section>
  );
}
