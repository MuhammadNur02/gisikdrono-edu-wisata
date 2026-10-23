import type { HomeGalleryPhoto } from '@/lib/utils/home-gallery';
import type { HomeStats } from '@/lib/utils/home-stats';
import type { ActivityPoint } from '@/types/activity-point';
import type { ArticleSummary } from '@/types/article';
import type { HeroSlideData } from '@/types/banner';
import type { BookletSummary } from '@/types/booklet';
import type { PackageSummary } from '@/types/package';
import type { ProductSummary } from '@/types/product';
import type { PublicReview } from '@/types/review';
import type { RwUnitProfile } from '@/types/rw-unit';

// Everything the home page shows (docs/PRD.md FR-PUB-01..07), already picked and limited.
export interface HomePageData {
  slides: HeroSlideData[];
  rwUnits: RwUnitProfile[];
  featuredPackages: PackageSummary[];
  // The Why-visit figures, counted from the rows below and the published reviews.
  stats: HomeStats;
  // Captioned photos of the first /galeri page: the first one is the photo band, the rest the strip.
  gallery: HomeGalleryPhoto[];
  featuredProducts: ProductSummary[];
  points: ActivityPoint[];
  testimonials: PublicReview[];
  articles: ArticleSummary[];
  booklets: BookletSummary[];
  // site_settings `seo.default_description` and `kelurahan.address`.
  description: string;
  address: string | null;
}
