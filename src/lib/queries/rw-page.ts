import 'server-only';

import { listActivityPoints } from '@/lib/queries/activity-points';
import { listGalleryPage } from '@/lib/queries/galleries';
import { listPackages } from '@/lib/queries/packages';
import { listProducts } from '@/lib/queries/products';
import { getRwUnitBySlug } from '@/lib/queries/rw-units';
import { listSchedules } from '@/lib/queries/schedules';
import type { RwPageData } from '@/types/rw-page';

// The RW page shows two rows of the masonry at lg; the full gallery pages through the rest.
export const RW_GALLERY_PREVIEW_LIMIT = 8;

// docs/PRD.md FR-PUB-08/09: an RW page shows only that RW's published rows. Every read is one of the cached
// public queries, so the page revalidates with their tags. NULL for a slug no active RW has (rw_units_public_read).
export async function getRwPageData(slug: string): Promise<RwPageData | null> {
  const unit = await getRwUnitBySlug(slug);
  if (!unit) return null;
  const rwId = unit.id;
  const [points, galleryPage, products, packages, schedules] = await Promise.all([
    listActivityPoints(),
    listGalleryPage({ owner: rwId }),
    listProducts(),
    listPackages(),
    unit.scheduleEnabled ? listSchedules() : [],
  ]);
  return {
    unit,
    points: points.filter((point) => point.rwId === rwId),
    gallery: galleryPage.items.slice(0, RW_GALLERY_PREVIEW_LIMIT),
    products: products.filter((product) => product.rw.id === rwId),
    packages: packages.filter((pkg) => pkg.rws.some((rw) => rw.id === rwId)),
    schedules: schedules.filter((schedule) => schedule.rwId === rwId),
  };
}
