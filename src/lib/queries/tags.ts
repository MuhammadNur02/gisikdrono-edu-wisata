import type { RwId } from '@/config/rw';

// CLAUDE.md §5.5: the only place revalidation tags are spelled. A public read caches under these tags and the
// action that changes the data revalidates the same ones, so both sides always agree on the string.

// A combo package belongs to no RW (tour_packages.rw_id is NULL), so it has a tag of its own.
export type PackageOwner = RwId | 'combo';

// galleries.rw_id is NULL for a kelurahan photo (decision of 2026-10-18).
export type GalleryOwner = RwId | 'kelurahan';

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// A session tag covers one calendar month, `YYYY-MM`. A misspelt month would build a tag nothing ever
// revalidates, so it fails loudly instead.
function sessionsTag(rwId: RwId, month: string): string {
  if (!MONTH_KEY_PATTERN.test(month)) throw new Error(`"${month}" is not a YYYY-MM month`);
  return `sessions:${String(rwId)}:${month}`;
}

export const TAGS = {
  packages: (owner: PackageOwner) => `packages:${String(owner)}`,
  sessions: sessionsTag,
  products: (rwId: RwId) => `products:${String(rwId)}`,
  galleries: (owner: GalleryOwner) => `galleries:${String(owner)}`,
  // rw_units content (the RW pages) and activity_points have tags of their own (decision of 2026-10-18).
  rwUnits: 'rw-units',
  activityPoints: (rwId: RwId) => `activity-points:${String(rwId)}`,
  articles: 'articles',
  banners: 'banners',
  booklets: 'booklets',
  schedules: 'schedules',
  reviews: 'reviews',
  settings: 'settings',
  booking: (bookingId: string) => `booking:${bookingId}`,
} as const;
