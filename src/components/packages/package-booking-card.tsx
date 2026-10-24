import { ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { AvailabilityPreview } from '@/components/packages/availability-preview';
import { Button } from '@/components/ui/button';
import { PACKAGE_CATEGORY } from '@/config/status';
import { packageDetailCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort } from '@/lib/utils/dates';
import { describePackagePrice } from '@/lib/utils/package-price';
import { bookingPath } from '@/lib/utils/paths';
import type { PackageDetail } from '@/types/package';

function validityLine(pkg: PackageDetail): string | null {
  if (!pkg.validFrom && !pkg.validTo) return null;
  return copy.catalogue.validity(
    pkg.validFrom ? formatDateShort(pkg.validFrom) : null,
    pkg.validTo ? formatDateShort(pkg.validTo) : null,
  );
}

// `Rp35.000 / orang` in Jakarta 36/800, `mulai` before it when the package has price tiers. Rupiah as stored: nothing
// here computes a total (CLAUDE.md §7.1).
function PanelPrice({ pkg }: { pkg: PackageDetail }) {
  const price = describePackagePrice(pkg);
  if (!price) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm text-muted-foreground">
      {price.isFromPrice ? <span>{copy.catalogue.fromPrice}</span> : null}
      <span className="font-display text-3xl leading-none font-extrabold tracking-tight text-foreground tabular-nums md:text-4xl">
        {formatIDR(price.amount)}
      </span>
      <span>{copy.catalogue.perBasis[price.basis]}</span>
    </p>
  );
}

export interface PackageBookingCardProps {
  pkg: PackageDetail;
  // `RW 05 Ecowastreme`: the full names of the RWs the package visits.
  rwNames: readonly string[];
}

// `Pelajar · 120 menit · RW 05 Ecowastreme`.
function factsLine(pkg: PackageDetail, rwNames: readonly string[]): string {
  return [
    PACKAGE_CATEGORY[pkg.category].label,
    pkg.durationMinutes ? copy.catalogue.minutes(pkg.durationMinutes) : null,
    ...rwNames,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

// The booking panel of DESIGN-SPEC §3.5 (420 px, sticky 96 px under the top, the surface, radius 20, the panel shadow):
// the price, the facts, the availability of the next 14 days and the two ways into the booking wizard. Below md the
// buttons give way to the sticky bar, so a phone keeps one primary call to action (docs/StyleGuide.md §10.2).
export function PackageBookingCard({ pkg, rwNames }: PackageBookingCardProps) {
  const validity = validityLine(pkg);
  return (
    <aside className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-7 md:shadow-panel">
      <div className="space-y-2.5">
        <PanelPrice pkg={pkg} />
        <p className="text-caption text-muted-foreground">{factsLine(pkg, rwNames)}</p>
        {validity ? <p className="text-caption text-muted-foreground">{validity}</p> : null}
      </div>
      <div className="border-t border-border pt-6">
        <AvailabilityPreview rws={pkg.rws} />
      </div>
      <div className="flex flex-col gap-3 max-md:hidden">
        <Button size="xl" asChild className="w-full">
          <Link href={bookingPath(pkg.slug)}>
            {text.bookNow}
            <ArrowRight aria-hidden data-icon="trailing" />
          </Link>
        </Button>
        <Button variant="outline" asChild className="w-full">
          <Link href={bookingPath(pkg.slug)}>
            {text.requestQuotation}
            <FileText aria-hidden />
          </Link>
        </Button>
      </div>
      <p className="flex gap-2.5 text-caption text-muted-foreground">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-rw05" />
        {text.panelNote}
      </p>
    </aside>
  );
}
