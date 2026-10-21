import { RW_ID_MIN, rwNumber, type RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';

// docs/PRD.md FR-PUB-14, docs/StyleGuide.md §5.11: the filters of /galeri. `rw05`, `rw08` and so on filter on
// `rw_id`, one for every RW that is online (decision of 2026-10-21); `umkm` and `kunjungan` on `gallery_category`.
// src/middleware.ts checks a value before the page renders and knows no RW, so it accepts any `rwNN`; the page, which
// does, sends an RW that is not online back to the whole gallery.
export const GALLERY_CATEGORY_FILTER_VALUES = ['umkm', 'kunjungan'] as const;
export type GalleryCategoryFilter = (typeof GALLERY_CATEGORY_FILTER_VALUES)[number];
export type GalleryFilterValue = `rw${string}` | GalleryCategoryFilter;

export type GalleryQuery = { owner: RwId } | { category: EnumValue<'gallery_category'> };

export const GALLERY_CATEGORY_FILTERS: Record<
  GalleryCategoryFilter,
  { label: string; category: EnumValue<'gallery_category'> }
> = {
  umkm: { label: 'UMKM', category: 'umkm' },
  kunjungan: { label: 'Kunjungan', category: 'visit' },
};

const RW_FILTER_PATTERN = /^rw(\d{2})$/;

export function galleryFilterForRw(rwId: RwId): GalleryFilterValue {
  return `rw${rwNumber(rwId)}`;
}

function isCategoryFilter(value: string): value is GalleryCategoryFilter {
  return GALLERY_CATEGORY_FILTER_VALUES.some((filter) => filter === value);
}

// `rw05` -> 5; NULL for anything that is not an RW filter.
function rwOfFilter(value: string): RwId | null {
  const digits = RW_FILTER_PATTERN.exec(value)?.[1];
  if (digits === undefined) return null;
  const rwId = Number(digits);
  return rwId >= RW_ID_MIN ? rwId : null;
}

export function isGalleryFilter(value: string): value is GalleryFilterValue {
  return isCategoryFilter(value) || rwOfFilter(value) !== null;
}

// What a filter asks the gallery for; NULL for a value the page never links to.
export function galleryQueryFor(filter: string): GalleryQuery | null {
  if (isCategoryFilter(filter)) return { category: GALLERY_CATEGORY_FILTERS[filter].category };
  const rwId = rwOfFilter(filter);
  return rwId === null ? null : { owner: rwId };
}

// docs/StyleGuide.md §8.2: the lightbox shows a photo up to 1600 px, the largest file the pipeline keeps,
// with smaller files for smaller screens.
export const GALLERY_LIGHTBOX_WIDTHS = [960, 1280, 1600] as const;

// `Muat lagi` adds a page of 24 (GALLERY_PAGE_SIZE) through `?halaman=`, and the page renders every page up to
// that one. The cap keeps a hand-typed `?halaman=99999` from loading thousands of photos at once: past it,
// the visitor is sent to the last page allowed (decision of 2026-10-18).
export const GALLERY_MAX_PAGES = 20;

// The YouTube player loads only after the visitor presses play, from the privacy-enhanced domain, which is
// the one frame origin the public CSP allows for it (docs/Security.md §8.2, src/lib/csp.ts).
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
// The still of a video without an uploaded thumbnail (galleries.thumbnail_path); `hqdefault` exists for
// every video, 4:3 with the 16:9 picture letterboxed inside it, which the 16:9 tile crops away.
export const YOUTUBE_STILL_ORIGIN = 'https://i.ytimg.com';
// The hosts /privasi names to visitors (docs/Security.md §7.6), taken from the addresses above so the notice
// cannot drift from what the gallery loads.
export const YOUTUBE_PLAYER_HOST = new URL(YOUTUBE_EMBED_ORIGIN).host.replace(/^www\./, '');
export const YOUTUBE_STILL_HOST = new URL(YOUTUBE_STILL_ORIGIN).host;
