import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { GalleryFilter } from '@/components/gallery/gallery-filter';
import { MasonryGrid } from '@/components/gallery/masonry-grid';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { FilterEmpty } from '@/components/marketing/filter-empty';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { GALLERY_MAX_PAGES, galleryQueryFor } from '@/config/gallery';
import { copy } from '@/lib/copy/id';
import { publicMediaUrl } from '@/lib/images/public-media';
import {
  listGalleryPages,
  type GalleryFilter as GalleryQueryFilter,
} from '@/lib/queries/galleries';
import { listRwUnits } from '@/lib/queries/rw-units';
import { imageGalleryJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import {
  galleryItemAnchor,
  galleryPath,
  readGallerySearch,
  type GallerySearch,
  type GallerySearchParams,
} from '@/lib/utils/gallery-search';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { GalleryItem, GalleryPages } from '@/types/gallery';
import type { RwBadge } from '@/types/rw-unit';

const TITLE = 'Galeri';
const DESCRIPTION = 'Foto dan video kegiatan di kampung-kampung edukasi Kelurahan Gisikdrono.';

interface GalleryPageProps {
  searchParams: Promise<GallerySearchParams>;
}

// Every filter is its own page for search engines; `?halaman=` only repeats the first page and more.
export async function generateMetadata({ searchParams }: GalleryPageProps): Promise<Metadata> {
  const { search } = readGallerySearch(await searchParams);
  return buildPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    path: galleryPath({ filter: search.filter, page: 1 }),
  });
}

// Photos only; NULL when the view holds none, such as a filter with only videos.
function galleryLd(search: GallerySearch, items: readonly GalleryItem[]) {
  const images = items.flatMap((item) =>
    item.image && item.youtubeId === null
      ? [{ url: publicMediaUrl(item.image.path), caption: item.caption ?? item.alt }]
      : [],
  );
  if (images.length === 0) return null;
  return imageGalleryJsonLd({
    name: TITLE,
    path: galleryPath({ filter: search.filter, page: 1 }),
    images,
  });
}

// `Muat lagi` jumps to the first new tile, so the visitor carries on where the list grew (§5.11).
function LoadMore({ search, gallery }: { search: GallerySearch; gallery: GalleryPages }) {
  if (!gallery.hasMore || search.page >= GALLERY_MAX_PAGES) return null;
  const next = galleryPath({ filter: search.filter, page: search.page + 1 });
  return (
    <div className="flex justify-center">
      <Button variant="outline" size="lg" asChild>
        <Link href={`${next}#${galleryItemAnchor(gallery.items.length + 1)}`}>
          {copy.gallery.loadMore}
        </Link>
      </Button>
    </div>
  );
}

function GalleryJsonLd({
  search,
  items,
}: {
  search: GallerySearch;
  items: readonly GalleryItem[];
}) {
  const data = galleryLd(search, items);
  return data ? <JsonLd data={data} /> : null;
}

interface GalleryBodyProps {
  search: GallerySearch;
  gallery: GalleryPages;
  rws: readonly RwBadge[];
}

function GalleryBody({ search, gallery, rws }: GalleryBodyProps) {
  return (
    <Container className="space-y-8 pb-16 md:pb-24">
      <GalleryFilter active={search.filter} rws={rws} />
      {gallery.items.length > 0 ? (
        <MasonryGrid items={gallery.items} />
      ) : (
        <FilterEmpty message={copy.gallery.filterEmpty} clearHref={PUBLIC_PATHS.gallery} />
      )}
      <LoadMore search={search} gallery={gallery} />
      <GalleryJsonLd search={search} items={gallery.items} />
    </Container>
  );
}

// The whole gallery, a category, or an RW that is online; NULL for the filter of an RW that is not.
function queryFor(search: GallerySearch, rws: readonly RwBadge[]): GalleryQueryFilter | null {
  if (search.filter === null) return {};
  const query = galleryQueryFor(search.filter);
  if (query === null || ('owner' in query && !rws.some((rw) => rw.id === query.owner))) return null;
  return query;
}

// docs/PRD.md FR-PUB-14, Tasks P2.4.07 and P2.6.01. The page follows `?filter=` and `?halaman=`, so it is
// rendered per request, while every page of items it shows is a cached read (tags `galleries:*`). An address
// the page would not link to itself, including a page past the last one, is redirected to the nearest valid
// one (decision of 2026-10-18). With nothing published the page is its header alone (StyleGuide §6.9).
export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const { search, isCanonical } = readGallerySearch(await searchParams);
  if (!isCanonical) redirect(galleryPath(search));
  const rws = await listRwUnits();
  const query = queryFor(search, rws);
  // The middleware knows no RW, so the filter of an RW that is not online gets this far; it goes to the whole gallery.
  if (query === null) redirect(PUBLIC_PATHS.gallery);
  const gallery = await listGalleryPages(query, search.page);
  if (gallery.pageCount < search.page)
    redirect(galleryPath({ ...search, page: gallery.pageCount }));
  const isGalleryEmpty = search.filter === null && gallery.items.length === 0;
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.gallery}
      />
      {isGalleryEmpty ? null : <GalleryBody search={search} gallery={gallery} rws={rws} />}
    </>
  );
}
