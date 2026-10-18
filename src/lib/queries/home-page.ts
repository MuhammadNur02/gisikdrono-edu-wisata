import 'server-only';

import { listActivityPoints } from '@/lib/queries/activity-points';
import { listArticles } from '@/lib/queries/articles';
import { listHeroBanners } from '@/lib/queries/banners';
import { listBooklets } from '@/lib/queries/booklets';
import { listPackages } from '@/lib/queries/packages';
import { listProducts } from '@/lib/queries/products';
import { listPublicReviews } from '@/lib/queries/reviews';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { summarizeRatings } from '@/lib/utils/ratings';
import type { HeroBanner } from '@/types/banner';
import type { HomePageData } from '@/types/home-page';
import type { ProductSummary } from '@/types/product';

// Limits from docs/PRD.md FR-PUB-04..06 and docs/StyleGuide.md §5.10.
export const HOME_LIMITS = {
  packages: 6,
  products: 4,
  testimonials: 3,
  articles: 3,
} as const;

function pairWithProducts(banners: HeroBanner[], products: ProductSummary[]) {
  return banners.map((banner) => ({
    banner,
    product: products.find((product) => product.slug === banner.productSlug) ?? null,
  }));
}

// Composes the cached public queries, so the page revalidates with their tags. Sections whose list is
// empty are left out by the page; nothing here invents a stand-in (docs/StyleGuide.md §1.3 G5).
export async function getHomePageData(): Promise<HomePageData> {
  const [banners, products, rwUnits, packages, points, reviews, articles, booklets, settings] =
    await Promise.all([
      listHeroBanners(),
      listProducts(),
      listRwUnits(),
      listPackages(),
      listActivityPoints(),
      listPublicReviews(),
      listArticles(),
      listBooklets(),
      getPublicSiteSettings(),
    ]);
  return {
    slides: pairWithProducts(banners, products),
    ratingSummary: summarizeRatings(reviews),
    rwUnits,
    featuredPackages: packages.filter((pkg) => pkg.isFeatured).slice(0, HOME_LIMITS.packages),
    featuredProducts: products
      .filter((product) => product.isFeatured)
      .slice(0, HOME_LIMITS.products),
    points,
    testimonials: reviews.filter((review) => review.isFeatured).slice(0, HOME_LIMITS.testimonials),
    articles: articles.slice(0, HOME_LIMITS.articles),
    booklets,
    description: settings.seoDefaultDescription,
    address: settings.kelurahanAddress,
  };
}
