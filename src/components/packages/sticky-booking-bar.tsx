import Link from 'next/link';

import { PackagePrice } from '@/components/packages/package-price';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import { bookingPath } from '@/lib/utils/paths';
import type { PackageSummary } from '@/types/package';

// docs/StyleGuide.md §10.2: below md the package page keeps its price and `Pesan Sekarang` in reach at the
// bottom of the screen; the WhatsApp button moves up above it (§5.16, STICKY_MOBILE_CTA_PARENTS).
export function StickyBookingBar({ pkg }: { pkg: PackageSummary }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md md:hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <PackagePrice pkg={pkg} className="min-w-0" />
        <Button asChild className="shrink-0">
          <Link href={bookingPath(pkg.slug)}>{copy.catalogue.bookNow}</Link>
        </Button>
      </div>
    </div>
  );
}
