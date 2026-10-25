import type { SessionSummary } from '@/lib/utils/session-summary';
import type { ActivityPoint } from '@/types/activity-point';
import type { GalleryItem } from '@/types/gallery';
import type { PackageSummary } from '@/types/package';
import type { ProductSummary } from '@/types/product';
import type { RwUnitProfile } from '@/types/rw-unit';
import type { PerformanceSchedule } from '@/types/schedule';

// Everything an RW page shows, already narrowed to that RW (docs/PRD.md FR-PUB-08/09).
export interface RwPageData {
  unit: RwUnitProfile;
  points: ActivityPoint[];
  gallery: GalleryItem[];
  products: ProductSummary[];
  // The RW's own packages and the combos that visit it.
  packages: PackageSummary[];
  schedules: PerformanceSchedule[];
  // The RW's visit days and session times of the coming weeks (the facts strip).
  sessions: SessionSummary;
  // site_settings `contact.whatsapp_number`; NULL until the kelurahan sets it, when the env number stands in.
  whatsappNumber: string | null;
}
