import Link from 'next/link';

import { SectionShell } from '@/components/layout/section';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA } from '@/config/nav';
import { siteConfig } from '@/config/site';
import type { HeroBanner } from '@/types/banner';

const HEADING_ID = 'tentang-gisikdrono-judul';
// Shown until the kelurahan uploads a banner, whose title then heads the introduction.
const FALLBACK_HEADING = 'Kampung yang menjadi ruang belajar';
const SECONDARY_CTA_LABEL = 'Lihat Paket';
// The first line of the address block, as dusunbambu.id puts its region above the street.
const REGION_LINE = `${siteConfig.locality.city}, Indonesia`;

// What a first-time visitor needs before choosing a kampung (docs/PRD.md §1): the two programmes and who books them.
const INTRO_PARAGRAPHS = [
  'Gisikdrono adalah kelurahan di Semarang Barat yang menjadikan kampungnya ruang belajar terbuka. Di RW 05 Ecowastreme, Anda melihat langsung cara warga memilah sampah di Bank Sampah, mengolahnya menjadi kompos dan pakan maggot, lalu menghidupkan kebun sayur dan kerajinan daur ulang karya ibu-ibu PKK.',
  'Di RW 08 Kampung Seni Budaya, sanggar anak menghadirkan tari tradisional dan dolanan, permainan anak khas Jawa, yang bisa Anda coba bersama mereka. Sekolah, kampus, instansi, maupun keluarga dapat memilih paket kunjungan yang sesuai, lalu memesannya langsung di sini.',
] as const;

export interface HomeIntroProps {
  id: string;
  // The first hero banner: its title heads the section and its button, when set, is the primary action.
  banner?: HeroBanner;
  // Where `Lihat Paket` scrolls to; left out when the page has no featured packages.
  packagesAnchor?: string;
  // site_settings `kelurahan.address`; NULL while it is still the seeded sample.
  address: string | null;
}

function IntroActions({
  banner,
  packagesAnchor,
}: Pick<HomeIntroProps, 'banner' | 'packagesAnchor'>) {
  const primary =
    banner?.ctaLabel && banner.ctaHref
      ? { label: banner.ctaLabel, href: banner.ctaHref }
      : { label: BOOKING_CTA.label, href: BOOKING_CTA.href };
  // Below md the pair stacks at full width, the one place a button may (docs/StyleGuide.md §5.1).
  return (
    <div className="flex flex-col gap-3 pt-2 md:flex-row md:flex-wrap">
      <Button size="xl" asChild>
        <Link href={primary.href}>{primary.label}</Link>
      </Button>
      {packagesAnchor ? (
        <Button size="xl" variant="outline" asChild>
          <Link href={`#${packagesAnchor}`}>{SECONDARY_CTA_LABEL}</Link>
        </Button>
      ) : null}
    </div>
  );
}

// The introduction under the hero (redesign of 2026-10-24, after dusunbambu.id): the photo carries one statement
// only, and the words about the place, where it is and the two buttons follow here. Its arc is painted over the
// photo's lower edge. Nothing reveals: it sits in the first screen.
export function HomeIntro({ id, banner, packagesAnchor, address }: HomeIntroProps) {
  return (
    <SectionShell id={id} labelledBy={HEADING_ID} wave={{ variant: 'arc' }}>
      <div className="max-w-4xl space-y-6">
        <h2 id={HEADING_ID} className="text-h2 text-balance">
          {banner?.title ?? FALLBACK_HEADING}
        </h2>
        {INTRO_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph} className="text-body-lg text-pretty">
            {paragraph}
          </p>
        ))}
        <address className="space-y-1 pt-2 text-body font-semibold not-italic">
          <p>{REGION_LINE}</p>
          <p>{address ?? siteConfig.ownerName}</p>
        </address>
        <IntroActions banner={banner} packagesAnchor={packagesAnchor} />
      </div>
    </SectionShell>
  );
}
