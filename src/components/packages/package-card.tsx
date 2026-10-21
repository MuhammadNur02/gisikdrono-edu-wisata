import { Clock, Users } from 'lucide-react';
import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { PackagePrice } from '@/components/packages/package-price';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IMAGE_SIZES } from '@/config/images';
import { PACKAGE_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { bookingPath, packagePath } from '@/lib/utils/paths';
import type { PackageSummary } from '@/types/package';

const COVER_ASPECT = 'aspect-4/3';

export interface PackageCardProps {
  pkg: PackageSummary;
}

// At most two badges on the cover (docs/StyleGuide.md §5.8): the RW and the category, or, for a combo, both
// RWs in their accents, RW 05 first (§2.7), with the category in the meta row below.
function CoverBadges({ pkg }: PackageCardProps) {
  const isCombo = pkg.category === 'combo';
  return (
    <div className="absolute inset-x-3 top-3 flex justify-between gap-2">
      <div className="flex gap-1.5">
        {pkg.rws.map((rw) => (
          <RwTag key={rw.id} rw={rw} />
        ))}
      </div>
      {isCombo ? null : <Badge variant="secondary">{PACKAGE_CATEGORY[pkg.category].label}</Badge>}
    </div>
  );
}

function PackageCover({ pkg }: PackageCardProps) {
  return (
    <div className="relative">
      {pkg.cover ? (
        <PhotoFrame
          image={pkg.cover}
          sizes={IMAGE_SIZES.card}
          aspectClassName={COVER_ASPECT}
          className="rounded-none"
        />
      ) : (
        <PhotoPlaceholder
          label={pkg.name}
          icon={PACKAGE_CATEGORY[pkg.category].icon}
          rws={pkg.rws}
          className={`${COVER_ASPECT} rounded-none`}
        />
      )}
      <CoverBadges pkg={pkg} />
    </div>
  );
}

export function PackageMeta({ pkg }: PackageCardProps) {
  const CategoryIcon = PACKAGE_CATEGORY[pkg.category].icon;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted-foreground">
      {pkg.category === 'combo' ? (
        <li className="flex items-center gap-1.5">
          <CategoryIcon aria-hidden className="size-4" />
          {copy.catalogue.combo}
        </li>
      ) : null}
      {pkg.durationMinutes ? (
        <li className="flex items-center gap-1.5">
          <Clock aria-hidden className="size-4" />
          {copy.catalogue.minutes(pkg.durationMinutes)}
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <Users aria-hidden className="size-4" />
        {copy.catalogue.paxRange(pkg.minPax, pkg.maxPax)}
      </li>
    </ul>
  );
}

// The title link stretches over the whole card, so the card is one link; the two buttons sit above it. The
// booking button is `secondary` because a grid shows several cards at once and a screen keeps one primary
// call to action (§1.3 G9, which wins over the `default` button of §5.8).
export function PackageCard({ pkg }: PackageCardProps) {
  const detailHref = packagePath(pkg.slug);
  return (
    <Card
      variant="interactive"
      className="relative w-full gap-4 overflow-hidden pt-0 md:gap-4 md:pt-0"
    >
      <PackageCover pkg={pkg} />
      <div className="space-y-3 px-5 md:px-6">
        <h3 className="line-clamp-2 text-h4">
          <Link
            href={detailHref}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {pkg.name}
          </Link>
        </h3>
        <PackageMeta pkg={pkg} />
        <PackagePrice pkg={pkg} />
      </div>
      <div className="relative mt-auto flex flex-wrap gap-2 px-5 md:px-6">
        <Button variant="secondary" asChild>
          <Link href={bookingPath(pkg.slug)}>{copy.catalogue.bookNow}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href={detailHref}>{copy.catalogue.packageDetail}</Link>
        </Button>
      </div>
    </Card>
  );
}
