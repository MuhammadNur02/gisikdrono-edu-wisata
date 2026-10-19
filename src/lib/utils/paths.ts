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

// "Unduh PDF" goes through the server, which counts the download before it hands out the file (docs/PRD.md
// FR-PUB-07, Task P2.4.08).
export function bookletDownloadPath(bookletId: string): string {
  return `/api/documents/booklet/${bookletId}`;
}

// The booking wizard opens on its first step (docs/PRD.md FR-PUB-12).
export function bookingPath(packageSlug: string): string {
  return `/pesan/${packageSlug}?step=jadwal`;
}
