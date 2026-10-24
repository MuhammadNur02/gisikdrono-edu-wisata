import Link from 'next/link';

import { PackagePrice } from '@/components/packages/package-price';
import { Button } from '@/components/ui/button';
import { PACKAGE_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { bookingPath } from '@/lib/utils/paths';
import type { PackageSummary } from '@/types/package';

// `Pelajar · 120 menit` under the price.
function factsOf(pkg: PackageSummary): string {
  const parts = [PACKAGE_CATEGORY[pkg.category].label];
  if (pkg.durationMinutes) parts.push(copy.catalogue.minutes(pkg.durationMinutes));
  return parts.join(' · ');
}

// DESIGN-SPEC §3.5 (docs/StyleGuide.md §10.2): below md the package page keeps its price and `Pesan Sekarang` in reach
// at the bottom of the screen, 80 px on the surface at 96 % with a blur, clear of the home indicator; the WhatsApp
// button moves up above it (STICKY_MOBILE_CTA_PARENTS) and the page reserves the room at its end.
export function StickyBookingBar({ pkg }: { pkg: PackageSummary }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/96 pb-safe shadow-bar backdrop-blur-lg md:hidden">
      <div className="flex h-20 items-center justify-between gap-4 px-5">
        <div className="min-w-0 space-y-1">
          <PackagePrice pkg={pkg} />
          <p className="truncate text-caption text-muted-foreground">{factsOf(pkg)}</p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link href={bookingPath(pkg.slug)}>{copy.catalogue.bookNow}</Link>
        </Button>
      </div>
    </div>
  );
}
