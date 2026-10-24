import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { PACKAGE_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { describePackagePrice } from '@/lib/utils/package-price';
import { bookingPath } from '@/lib/utils/paths';
import type { PackageSummary } from '@/types/package';

// `Pelajar · 120 menit` after the unit, from sm, where the bar has the room.
function factsOf(pkg: PackageSummary): string {
  const parts = [PACKAGE_CATEGORY[pkg.category].label];
  if (pkg.durationMinutes) parts.push(copy.catalogue.minutes(pkg.durationMinutes));
  return parts.join(' · ');
}

// The amount on its own line, `mulai` and the unit (and, from sm, the facts) under it: at 360 px nothing wraps into
// anything else.
// Rupiah as stored; nothing here computes a total (CLAUDE.md §7.1).
function BarPrice({ pkg }: { pkg: PackageSummary }) {
  const price = describePackagePrice(pkg);
  if (!price) return null;
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-price whitespace-nowrap text-foreground">{formatIDR(price.amount)}</p>
      <p className="text-caption text-muted-foreground">
        {price.isFromPrice ? `${copy.catalogue.fromPrice} ` : null}
        {copy.catalogue.perBasis[price.basis]}
        <span className="max-sm:hidden"> · {factsOf(pkg)}</span>
      </p>
    </div>
  );
}

// DESIGN-SPEC §3.5 (docs/StyleGuide.md §10.2): below md the package page keeps its price and `Pesan Sekarang` in reach
// at the bottom of the screen, 80 px on the surface at 96 % with a blur, clear of the home indicator; the WhatsApp
// button moves up above it (STICKY_MOBILE_CTA_PARENTS) and the page reserves the room at its end.
export function StickyBookingBar({ pkg }: { pkg: PackageSummary }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/96 pb-safe shadow-bar backdrop-blur-lg md:hidden">
      <div className="flex min-h-20 items-center justify-between gap-4 px-5 py-3">
        <BarPrice pkg={pkg} />
        <Button asChild size="lg" className="shrink-0">
          <Link href={bookingPath(pkg.slug)}>{copy.catalogue.bookNow}</Link>
        </Button>
      </div>
    </div>
  );
}
