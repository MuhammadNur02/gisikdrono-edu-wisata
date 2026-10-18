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
} as const;

export function packagePath(slug: string): string {
  return `${PUBLIC_PATHS.packages}/${slug}`;
}

export function productPath(slug: string): string {
  return `${PUBLIC_PATHS.products}/${slug}`;
}

export function articlePath(slug: string): string {
  return `/artikel/${slug}`;
}

export function bookletPath(slug: string): string {
  return `/e-booklet/${slug}`;
}

// The booking wizard opens on its first step (docs/PRD.md FR-PUB-12).
export function bookingPath(packageSlug: string): string {
  return `/pesan/${packageSlug}?step=jadwal`;
}
