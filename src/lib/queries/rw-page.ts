import 'server-only';

import { RW_PROGRAMMES, type RwId } from '@/config/rw';
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
// public queries, so the page revalidates with their tags. NULL when the RW is inactive (rw_units_public_read).
export async function getRwPageData(rwId: RwId): Promise<RwPageData | null> {
  const [unit, points, galleryPage, products, packages, schedules] = await Promise.all([
    getRwUnitBySlug(RW_PROGRAMMES[rwId].slug),
    listActivityPoints(),
    listGalleryPage({ owner: rwId }),
    listProducts(),
    listPackages(),
    listSchedules(),
  ]);
  if (!unit) return null;
  return {
    unit,
    points: points.filter((point) => point.rwId === rwId),
    gallery: galleryPage.items.slice(0, RW_GALLERY_PREVIEW_LIMIT),
    products: products.filter((product) => product.rwId === rwId),
    packages: packages.filter((pkg) => pkg.rwIds.includes(rwId)),
    schedules: schedules.filter((schedule) => schedule.rwId === rwId),
  };
}
