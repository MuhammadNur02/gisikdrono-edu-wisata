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
  map: '/peta-kontak',
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
const RW_SLUG_SOURCE = 'rw-\\d{2}(-[a-z0-9]+)+';
const RW_SCHEDULE_SEGMENT = 'jadwal';
const RW_SLUG_PATTERN = new RegExp(`^${RW_SLUG_SOURCE}$`);
const RW_ADDRESS_PATTERN = new RegExp(`^/${RW_SLUG_SOURCE}(/${RW_SCHEDULE_SEGMENT})?$`);

// The RW pages are built in one internal route folder, src/app/(public)/rw-page/[rwSlug]. src/middleware.ts serves
// an address shaped like an RW page from it and leaves every other one alone, so an unknown address at the top
// level matches no route and keeps its real 404 instead of the 200 of a page that streamed before notFound()
// (review of Task P2.10.02).
export const RW_ROUTE_FOLDER = '/rw-page';

export function isRwSlug(value: string): boolean {
  return RW_SLUG_PATTERN.test(value);
}

// The internal address the middleware serves a request from, or NULL to serve it from its own. A request for the
// folder itself goes to the folder's root, which has no page, so every RW page has one address only.
export function rwRouteRewriteFor(pathname: string): string | null {
  if (isPathUnder(pathname, RW_ROUTE_FOLDER)) return RW_ROUTE_FOLDER;
  return RW_ADDRESS_PATTERN.test(pathname) ? `${RW_ROUTE_FOLDER}${pathname}` : null;
}

// The address the visitor asked for. A prerendered RW page reads its internal address from usePathname() on the
// server and the visitor's in the browser, so the public menu reads both through here to mark the same page and
// hydrate without a mismatch.
export function visitorPathFor(pathname: string): string {
  return pathname.startsWith(`${RW_ROUTE_FOLDER}/`)
    ? pathname.slice(RW_ROUTE_FOLDER.length)
    : pathname;
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
