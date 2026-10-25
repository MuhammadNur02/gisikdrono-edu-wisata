import type { RwId } from '@/config/rw';
import type { HomeGalleryPhoto } from '@/lib/utils/home-gallery';
import type { SessionSummary } from '@/lib/utils/session-summary';
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
  // Captioned photos of the first /galeri page: one becomes the photo band, the rest the marquee.
  gallery: HomeGalleryPhoto[];
  featuredProducts: ProductSummary[];
  points: ActivityPoint[];
  testimonials: PublicReview[];
  articles: ArticleSummary[];
  booklets: BookletSummary[];
  // site_settings `seo.default_description` and `kelurahan.address`.
  description: string;
  address: string | null;
  // site_settings `contact.whatsapp_number`; NULL until the kelurahan sets it, when the env number stands in.
  whatsappNumber: string | null;
  // The RWs with at least one published package; the others are profile-only (FR-PUB-24).
  bookableRwIds: RwId[];
  // The visit days and session times of the coming weeks, for the contact block.
  sessions: SessionSummary;
}
