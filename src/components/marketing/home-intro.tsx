import { ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';

import { KawungDivider } from '@/components/layout/kawung-divider';
import { SectionShell } from '@/components/layout/section';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA } from '@/config/nav';
import { siteConfig } from '@/config/site';
import { homeCopy } from '@/lib/copy/home';

const HEADING_ID = 'tentang-gisikdrono-judul';
// `SEMARANG BARAT · KOTA SEMARANG · JAWA TENGAH`: the region over the address (DESIGN-SPEC §3.1).
const REGION_LINE = [
  siteConfig.locality.district.replace('Kecamatan ', ''),
  siteConfig.locality.city,
  siteConfig.locality.province,
].join(' · ');

export interface HomeIntroProps {
  id: string;
  // Where `Lihat Paket` scrolls to; left out when the page has no featured packages.
  packagesAnchor?: string;
  // site_settings `kelurahan.address`; NULL while it is still the seeded sample.
  address: string | null;
}

// Below sm the pair stacks at full width (DESIGN-SPEC §3.1).
function IntroActions({ packagesAnchor }: Pick<HomeIntroProps, 'packagesAnchor'>) {
  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
      <Button size="lg" asChild>
        <Link href={BOOKING_CTA.href}>
          {BOOKING_CTA.label}
          <ArrowRight data-icon="trailing" aria-hidden />
        </Link>
      </Button>
      {packagesAnchor ? (
        <Button size="lg" variant="outline" asChild>
          <Link href={`#${packagesAnchor}`}>{homeCopy.intro.secondaryCta}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function IntroLocation({ address }: Pick<HomeIntroProps, 'address'>) {
  return (
    <address className="reveal space-y-2 border-t border-border pt-5 not-italic">
      <p className="text-meta-caps text-rw05">{REGION_LINE}</p>
      <p className="flex gap-2 text-body-md text-ink-2">
        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        {address ?? siteConfig.ownerName}
      </p>
    </address>
  );
}

// The introduction under the hero (DESIGN-SPEC §3.1): the heading on the left; the two paragraphs, the location and
// the buttons on the right; then the batik divider. Its arc is painted over the photo's lower edge. The parts fade up
// one after another as they come into view.
export function HomeIntro({ id, packagesAnchor, address }: HomeIntroProps) {
  return (
    <SectionShell id={id} labelledBy={HEADING_ID} wave={{ variant: 'arc' }}>
      <div className="-mt-8 grid gap-6 md:-mt-10 lg:-mt-18 lg:grid-cols-2 lg:gap-x-24">
        <div className="space-y-4 reveal-stagger">
          <p className="flex reveal items-center gap-3 text-eyebrow text-primary-ink">
            <span aria-hidden className="h-0.5 w-7 bg-primary" />
            {homeCopy.intro.eyebrow}
          </p>
          <h2 id={HEADING_ID} className="reveal text-intro">
            {homeCopy.intro.title}
          </h2>
        </div>
        <div className="space-y-5 reveal-stagger lg:pt-3">
          <p className="reveal text-body-lg text-pretty text-ink-2">{homeCopy.intro.lead}</p>
          <p className="reveal text-body text-pretty text-ink-2">{homeCopy.intro.body}</p>
          <IntroLocation address={address} />
          <div className="reveal">
            <IntroActions packagesAnchor={packagesAnchor} />
          </div>
        </div>
      </div>
      <KawungDivider className="mt-14 md:mt-18" />
    </SectionShell>
  );
}
