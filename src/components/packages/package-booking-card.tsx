import { CalendarCheck } from 'lucide-react';
import Link from 'next/link';

import { AvailabilityPreview } from '@/components/packages/availability-preview';
import { PackageMeta } from '@/components/packages/package-card';
import { PackagePrice } from '@/components/packages/package-price';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort } from '@/lib/utils/dates';
import { bookingPath } from '@/lib/utils/paths';
import type { PackageDetail } from '@/types/package';

function PriceTiers({ pkg }: { pkg: PackageDetail }) {
  return (
    <div className="space-y-2">
      <h2 className="text-body-sm font-medium">{copy.catalogue.priceTiers}</h2>
      <dl className="divide-y divide-border text-body-sm">
        {pkg.priceTiers.map((tier) => (
          <div key={tier.minPax} className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">
              {copy.catalogue.tierRange(tier.minPax, tier.maxPax)}
            </dt>
            <dd className="tabular-nums">
              {formatIDR(tier.pricePerPax)} {copy.catalogue.perBasis.orang}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function validityLine(pkg: PackageDetail): string | null {
  if (!pkg.validFrom && !pkg.validTo) return null;
  return copy.catalogue.validity(
    pkg.validFrom ? formatDateShort(pkg.validFrom) : null,
    pkg.validTo ? formatDateShort(pkg.validTo) : null,
  );
}

// The aside of the package page from md; below md its button gives way to the sticky bar, so a phone screen
// keeps one primary call to action (docs/StyleGuide.md §1.3 G9, §10.2).
export function PackageBookingCard({ pkg }: { pkg: PackageDetail }) {
  const validity = validityLine(pkg);
  return (
    <aside className="space-y-6 rounded-xl border border-border bg-card p-5 md:p-6 dark:border-white/5">
      <div className="space-y-3">
        <PackagePrice pkg={pkg} />
        <PackageMeta pkg={pkg} />
        {validity ? <p className="text-caption text-muted-foreground">{validity}</p> : null}
      </div>
      {pkg.priceTiers.length > 0 ? <PriceTiers pkg={pkg} /> : null}
      <Button size="lg" asChild className="hidden w-full md:inline-flex">
        <Link href={bookingPath(pkg.slug)}>
          <CalendarCheck aria-hidden />
          {copy.catalogue.bookNow}
        </Link>
      </Button>
      <AvailabilityPreview rws={pkg.rws} />
    </aside>
  );
}
