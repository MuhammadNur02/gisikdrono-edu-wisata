// True for the prefix itself and every page below it, so /pesan matches /pesan/x but never /pesanan.
export function isPathUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// The public addresses of CMS entities (CLAUDE.md Appendix A.3), built in one place so links, the sitemap and
// JSON-LD always agree.
export const PUBLIC_PATHS = {
  packages: '/paket-wisata',
  products: '/produk',
  reviews: '/ulasan',
  privacy: '/privasi',
  gallery: '/galeri',
  articles: '/artikel',
  booklets: '/e-booklet',
} as const;

export function packagePath(slug: string): string {
  return `${PUBLIC_PATHS.packages}/${slug}`;
}

export function productPath(slug: string): string {
  return `${PUBLIC_PATHS.products}/${slug}`;
}

export function articlePath(slug: string): string {
  return `${PUBLIC_PATHS.articles}/${slug}`;
}

export function bookletPath(slug: string): string {
  return `${PUBLIC_PATHS.booklets}/${slug}`;
}

// An RW's page lives at its rw_units.slug, which rw_units_slug_matches_id starts with the RW's own `rw-NN-`, so an
// RW never takes the address of another page (decision of 2026-10-21).
const RW_SLUG_PATTERN = /^rw-\d{2}(-[a-z0-9]+)+$/;
const RW_SCHEDULE_SEGMENT = 'jadwal';

export function isRwSlug(value: string): boolean {
  return RW_SLUG_PATTERN.test(value);
}

export function rwPagePath(slug: string): string {
  return `/${slug}`;
}

export function rwSchedulePath(slug: string): string {
  return `${rwPagePath(slug)}/${RW_SCHEDULE_SEGMENT}`;
}

// "Unduh PDF" goes through the server, which counts the download before it hands out the file (docs/PRD.md
// FR-PUB-07, Task P2.4.08).
export function bookletDownloadPath(bookletId: string): string {
  return `/api/documents/booklet/${bookletId}`;
}

// The booking wizard opens on its first step (docs/PRD.md FR-PUB-12).
export function bookingPath(packageSlug: string): string {
  return `/pesan/${packageSlug}?step=jadwal`;
}
