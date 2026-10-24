import 'server-only';

import type { RwId } from '@/config/rw';
import { listActivityPoints } from '@/lib/queries/activity-points';
import { listArticles } from '@/lib/queries/articles';
import { listHeroBanners } from '@/lib/queries/banners';
import { listBooklets } from '@/lib/queries/booklets';
import { listGalleryPage } from '@/lib/queries/galleries';
import { listPackages } from '@/lib/queries/packages';
import { listProducts } from '@/lib/queries/products';
import { listPublicReviews } from '@/lib/queries/reviews';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getSessionSummary } from '@/lib/queries/session-summary';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { pickHomeGalleryPhotos } from '@/lib/utils/home-gallery';
import type { HeroBanner } from '@/types/banner';
import type { HomePageData } from '@/types/home-page';
import type { PackageSummary } from '@/types/package';
import type { ProductSummary } from '@/types/product';

// Limits from docs/PRD.md FR-PUB-04..06 and DESIGN-SPEC §3.1: three products beside the add-on panel, a slider of
// reviews, and ten photos for the band and the marquee (decision of 2026-10-23).
export const HOME_LIMITS = {
  packages: 6,
  products: 3,
  testimonials: 8,
  articles: 3,
  gallery: 10,
} as const;

function pairWithProducts(banners: HeroBanner[], products: ProductSummary[]) {
  return banners.map((banner) => ({
    banner,
    product: products.find((product) => product.slug === banner.productSlug) ?? null,
  }));
}

// The RWs a visitor can book a package for; an RW without one shows its profile only (FR-PUB-24).
function bookableRwIdsOf(packages: readonly PackageSummary[]): RwId[] {
  return [...new Set(packages.flatMap((pkg) => pkg.rws.map((rw) => rw.id)))];
}

function readHomeRows() {
  return Promise.all([
    listHeroBanners(),
    listProducts(),
    listRwUnits(),
    listPackages(),
    listActivityPoints(),
    listPublicReviews(),
    listArticles(),
    listBooklets(),
    listGalleryPage({}, 1),
    getPublicSiteSettings(),
  ]);
}

// Composes the cached public queries, so the page revalidates with their tags. Sections whose list is
// empty are left out by the page; nothing here invents a stand-in (docs/StyleGuide.md §1.3 G5).
export async function getHomePageData(): Promise<HomePageData> {
  const [
    banners,
    products,
    rwUnits,
    packages,
    points,
    reviews,
    articles,
    booklets,
    gallery,
    settings,
  ] = await readHomeRows();
  return {
    slides: pairWithProducts(banners, products),
    rwUnits,
    featuredPackages: packages.filter((pkg) => pkg.isFeatured).slice(0, HOME_LIMITS.packages),
    gallery: pickHomeGalleryPhotos(gallery.items, HOME_LIMITS.gallery),
    featuredProducts: products
      .filter((product) => product.isFeatured)
      .slice(0, HOME_LIMITS.products),
    points,
    testimonials: reviews.filter((review) => review.isFeatured).slice(0, HOME_LIMITS.testimonials),
    articles: articles.slice(0, HOME_LIMITS.articles),
    booklets,
    description: settings.seoDefaultDescription,
    address: settings.kelurahanAddress,
    whatsappNumber: settings.contactWhatsappNumber,
    bookableRwIds: bookableRwIdsOf(packages),
    sessions: await getSessionSummary(rwUnits.map((unit) => unit.id)),
  };
}
