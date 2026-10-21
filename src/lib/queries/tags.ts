import type { RwId } from '@/config/rw';

// CLAUDE.md §5.5: the only place revalidation tags are spelled. A public read caches under these tags and the
// action that changes the data revalidates the same ones, so both sides always agree on the string.

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
  sessions: sessionsTag,
  galleries: (owner: GalleryOwner) => `galleries:${String(owner)}`,
  // A read that spans every RW caches under an umbrella tag, since the RWs are data and a fixed list of owner tags
  // would miss the next one (decision of 2026-10-21). Packages, products and activity points are only read that way,
  // so their writes revalidate the umbrella alone; a gallery write revalidates its owner and the umbrella.
  allPackages: 'packages:all',
  allProducts: 'products:all',
  allGalleries: 'galleries:all',
  allActivityPoints: 'activity-points:all',
  // rw_units content (the RW pages) has a tag of its own (decision of 2026-10-18). Every read that names an RW caches
  // under rw-units as well, so a renamed or recoloured RW shows everywhere at once.
  rwUnits: 'rw-units',
  articles: 'articles',
  banners: 'banners',
  booklets: 'booklets',
  schedules: 'schedules',
  reviews: 'reviews',
  settings: 'settings',
  booking: (bookingId: string) => `booking:${bookingId}`,
} as const;
