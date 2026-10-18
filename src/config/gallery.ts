import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';

// docs/PRD.md FR-PUB-14, docs/StyleGuide.md §5.11: the four filters of /galeri. `rw05` and `rw08` filter on
// `rw_id`, `umkm` and `kunjungan` on `gallery_category`.
export const GALLERY_FILTER_VALUES = ['rw05', 'rw08', 'umkm', 'kunjungan'] as const;
export type GalleryFilterValue = (typeof GALLERY_FILTER_VALUES)[number];

export type GalleryQuery = { owner: RwId } | { category: EnumValue<'gallery_category'> };

export const GALLERY_FILTERS: Record<GalleryFilterValue, { label: string; query: GalleryQuery }> = {
  rw05: { label: 'RW 05', query: { owner: 5 } },
  rw08: { label: 'RW 08', query: { owner: 8 } },
  umkm: { label: 'UMKM', query: { category: 'umkm' } },
  kunjungan: { label: 'Kunjungan', query: { category: 'visit' } },
};

// docs/StyleGuide.md §8.2: the lightbox shows a photo up to 1600 px, the largest file the pipeline keeps,
// with smaller files for smaller screens.
export const GALLERY_LIGHTBOX_WIDTHS = [960, 1280, 1600] as const;

export const RW_GALLERY_FILTER: Record<RwId, GalleryFilterValue> = { 5: 'rw05', 8: 'rw08' };

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
