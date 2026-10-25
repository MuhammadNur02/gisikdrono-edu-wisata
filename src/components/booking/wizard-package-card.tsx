import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { IMAGE_SIZES } from '@/config/images';
import { PACKAGE_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import type { PackageSummary } from '@/types/package';

const META_SEPARATOR = ' · ';
const RW_JOINER = ' + ';

function metaLine(pkg: PackageSummary): string {
  const parts = [
    pkg.rws.map((rw) => rw.label).join(RW_JOINER),
    PACKAGE_CATEGORY[pkg.category].label,
  ];
  if (pkg.durationMinutes) parts.push(copy.catalogue.minutes(pkg.durationMinutes));
  return parts.join(META_SEPARATOR);
}

// The head of the Wizard Summary (DESIGN-SPEC §2.10): a 64 px thumbnail, the package's name and its meta line. Drawn
// on the server and handed to the wizard as a slot, so the browser side never needs the package's photo or category.
export function WizardPackageCard({ pkg }: { pkg: PackageSummary }) {
  return (
    <div className="flex items-center gap-4">
      {pkg.cover ? (
        <PhotoFrame
          image={pkg.cover}
          sizes={IMAGE_SIZES.listThumb}
          aspectClassName="aspect-square"
          className="size-16 shrink-0 rounded-md"
        />
      ) : (
        <PhotoPlaceholder
          label={pkg.name}
          icon={PACKAGE_CATEGORY[pkg.category].icon}
          rws={pkg.rws}
          iconClassName="size-6"
          className="size-16 shrink-0 rounded-md"
        />
      )}
      <div className="min-w-0 space-y-1">
        <p className="text-h4 font-bold text-foreground">{pkg.name}</p>
        <p className="text-caption text-muted-foreground">{metaLine(pkg)}</p>
      </div>
    </div>
  );
}
