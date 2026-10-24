import { ArrowRight, Clock, Users } from 'lucide-react';
import Link from 'next/link';

import { RwComboTag, RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { PackagePrice } from '@/components/packages/package-price';
import { IMAGE_SIZES } from '@/config/images';
import { PACKAGE_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { packagePath } from '@/lib/utils/paths';
import type { PackageSummary } from '@/types/package';

const COVER_ASPECT = 'aspect-4/3';

export interface PackageCardProps {
  pkg: PackageSummary;
}

// One badge on the cover (DESIGN-SPEC §2.5): the RW in its tint, or, for a package that visits several RWs, the combo
// badge in the primary set naming them (`RW 05 + RW 13`).
function CoverBadge({ pkg }: PackageCardProps) {
  const [onlyRw] = pkg.rws;
  return (
    <div className="absolute top-4 left-4">
      {pkg.rws.length === 1 && onlyRw ? <RwTag rw={onlyRw} /> : <RwComboTag rws={pkg.rws} />}
    </div>
  );
}

function PackageCover({ pkg }: PackageCardProps) {
  return (
    <div className="relative overflow-hidden rounded-lg">
      {pkg.cover ? (
        <PhotoFrame
          image={pkg.cover}
          sizes={IMAGE_SIZES.card}
          aspectClassName={COVER_ASPECT}
          className="rounded-none"
          imageClassName="hover-zoom"
        />
      ) : (
        <PhotoPlaceholder
          label={pkg.name}
          icon={PACKAGE_CATEGORY[pkg.category].icon}
          rws={pkg.rws}
          className={`${COVER_ASPECT} rounded-none`}
        />
      )}
      <CoverBadge pkg={pkg} />
    </div>
  );
}

// `PELAJAR · 120 MENIT`: who the package is for and how long it lasts (DESIGN-SPEC §2.5).
function metaLine(pkg: PackageSummary): string {
  const parts: string[] = [PACKAGE_CATEGORY[pkg.category].label];
  if (pkg.durationMinutes) parts.push(copy.catalogue.minutes(pkg.durationMinutes));
  return parts.join(' · ');
}

// The facts row of the package page's booking panel.
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

// Card/Package of DESIGN-SPEC §2.5: editorial, not a box. The photo (4:3, radius 14) with its badge, the meta line, the
// title, a tagline held to two lines so the footers of a row align, and the footer with the price and `Lihat paket`.
// The title link stretches over the card, so the whole card is one link. Hover: the card rises 4 px, the photo zooms
// to 1.04, the title turns primary-ink and the arrow steps forward.
export function PackageCard({ pkg }: PackageCardProps) {
  return (
    <article className="group relative flex h-full w-full hover-rise flex-col">
      <PackageCover pkg={pkg} />
      <div className="flex flex-1 flex-col gap-2.5 pt-5">
        <p className="text-meta-caps text-muted-foreground">{metaLine(pkg)}</p>
        <h3 className="text-card-title transition-colors duration-200 group-hover:text-primary-ink">
          <Link
            href={packagePath(pkg.slug)}
            className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring"
          >
            {pkg.name}
          </Link>
        </h3>
        <p className="line-clamp-2 min-h-12.5 text-body text-ink-2">{pkg.tagline}</p>
        <div className="mt-auto flex items-baseline justify-between gap-4 border-t border-border pt-4">
          <PackagePrice pkg={pkg} />
          <span
            aria-hidden
            className="inline-flex shrink-0 items-center gap-1.5 text-label font-semibold text-primary-ink"
          >
            {copy.catalogue.viewPackage}
            <ArrowRight className="size-4.5 hover-nudge" />
          </span>
        </div>
      </div>
    </article>
  );
}
