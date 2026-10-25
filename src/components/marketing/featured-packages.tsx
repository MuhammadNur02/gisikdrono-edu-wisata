import { ArrowRight, FileText, QrCode, UserRoundX } from 'lucide-react';
import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { SnapRail } from '@/components/marketing/snap-rail';
import { PackageCard } from '@/components/packages/package-card';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA } from '@/config/nav';
import { homeCopy } from '@/lib/copy/home';
import type { PackageSummary } from '@/types/package';

export interface FeaturedPackagesProps {
  id: string;
  packages: readonly PackageSummary[];
}

const TRUST_ICONS = [UserRoundX, QrCode, FileText] as const;

function AllPackagesButton({ className }: { className?: string }) {
  return (
    <Button variant="outline" size="default" asChild className={className}>
      <Link href={BOOKING_CTA.href}>
        {homeCopy.packages.all}
        <ArrowRight data-icon="trailing" aria-hidden />
      </Link>
    </Button>
  );
}

// Three promises of the booking flow under the cards, from lg only (DESIGN-SPEC §3.1: omitted on phones).
function TrustRow() {
  return (
    <ul className="grid gap-8 border-t border-border-strong pt-7 max-md:hidden md:grid-cols-3">
      {homeCopy.packages.trust.map((item, index) => {
        const Icon = TRUST_ICONS[index] ?? FileText;
        return (
          <li key={item.title} className="flex reveal gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-rw05">
              <Icon aria-hidden className="size-4.5" />
            </span>
            <span className="space-y-1">
              <span className="block text-label font-semibold">{item.title}</span>
              <span className="block text-body-sm text-muted-foreground">{item.body}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// From lg the cards sit three to a row; below md they are a scroll-snap carousel of 300 px cards that runs on past
// the right edge with progress bars under it (DESIGN-SPEC §3.1, §5).
const ROW_CLASS =
  'flex snap-x snap-mandatory gap-4 overflow-x-auto reveal-stagger scrollbar-none max-md:pr-container max-md:pl-container md:grid md:grid-cols-2 md:gap-6 md:overflow-visible lg:grid-cols-3';

function PackageRow({ rowId, packages }: { rowId: string; packages: readonly PackageSummary[] }) {
  return (
    <ul id={rowId} className={ROW_CLASS}>
      {packages.map((pkg) => (
        <li key={pkg.id} className="flex w-75 shrink-0 snap-start md:w-auto md:reveal">
          <PackageCard pkg={pkg} />
        </li>
      ))}
    </ul>
  );
}

// docs/PRD.md FR-PUB-04 (DESIGN-SPEC §3.1 `Paket pilihan`): the featured packages on the sunken paper, the trust row
// under them. Each card fades up 80 ms after the one before as it comes into view.
export function FeaturedPackages({ id, packages }: FeaturedPackagesProps) {
  const rowId = `${id}-baris`;
  return (
    <Section
      id={id}
      tone="muted"
      eyebrow={homeCopy.packages.eyebrow}
      title={homeCopy.packages.title}
      description={homeCopy.packages.description}
      headerAction={<AllPackagesButton className="max-md:hidden" />}
      className="lg:pt-30"
    >
      <div className="space-y-6 max-md:-mx-5">
        <PackageRow rowId={rowId} packages={packages} />
        <SnapRail targetId={rowId} count={packages.length} barsClassName="px-5 md:hidden" />
      </div>
      <AllPackagesButton className="w-full md:hidden" />
      <TrustRow />
    </Section>
  );
}
