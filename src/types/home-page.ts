import type { ActivityPoint } from '@/types/activity-point';
import type { ArticleSummary } from '@/types/article';
import type { HeroSlideData } from '@/types/banner';
import type { BookletSummary } from '@/types/booklet';
import type { PackageSummary } from '@/types/package';
import type { ProductSummary } from '@/types/product';
import type { PublicReview, RatingSummary } from '@/types/review';
import type { RwUnitProfile } from '@/types/rw-unit';

// Everything the home page shows (docs/PRD.md FR-PUB-01..07), already picked and limited.
export interface HomePageData {
  slides: HeroSlideData[];
  ratingSummary: RatingSummary | null;
  rwUnits: RwUnitProfile[];
  featuredPackages: PackageSummary[];
  featuredProducts: ProductSummary[];
  points: ActivityPoint[];
  testimonials: PublicReview[];
  articles: ArticleSummary[];
  booklets: BookletSummary[];
  // site_settings `seo.default_description` and `kelurahan.address`.
  description: string;
  address: string | null;
}
