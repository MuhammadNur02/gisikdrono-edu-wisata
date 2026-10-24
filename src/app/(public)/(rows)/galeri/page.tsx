import { ArrowDown, Images } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { GalleryFilter } from '@/components/gallery/gallery-filter';
import { GallerySkeleton } from '@/components/gallery/gallery-skeleton';
import { MasonryGrid } from '@/components/gallery/masonry-grid';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { GALLERY_MAX_PAGES, galleryQueryFor } from '@/config/gallery';
import { galleryPageCopy as text } from '@/lib/copy/catalogue';
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
import type { RwUnitSummary } from '@/types/rw-unit';

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

function canLoadMore(search: GallerySearch, gallery: GalleryPages): boolean {
  return gallery.hasMore && search.page < GALLERY_MAX_PAGES;
}

// `Muat lebih banyak` jumps to the first new tile, so the visitor carries on where the list grew (§5.11, DESIGN-SPEC
// §3.7): the count shown so far above an outline button with its arrow down.
function LoadMore({ search, gallery }: { search: GallerySearch; gallery: GalleryPages }) {
  if (!canLoadMore(search, gallery)) return null;
  const next = galleryPath({ filter: search.filter, page: search.page + 1 });
  return (
    <div className="flex flex-col items-center gap-4 pt-4 md:pt-8">
      <p className="text-body-sm text-muted-foreground">{text.showing(gallery.items.length)}</p>
      <Button variant="outline" size="lg" asChild>
        <Link href={`${next}#${galleryItemAnchor(gallery.items.length + 1)}`}>
          {text.loadMore}
          <ArrowDown aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

// A filter that matched nothing offers the whole gallery; a gallery with nothing published says it is coming.
function GalleryEmpty({ isFiltered }: { isFiltered: boolean }) {
  return (
    <CatalogueState
      role={isFiltered ? 'status' : undefined}
      icon={Images}
      tone="rw"
      className="rw-scope-combo"
      title={isFiltered ? text.emptyFilteredTitle : text.emptyAllTitle}
      description={isFiltered ? text.emptyFilteredBody : text.emptyAllBody}
      actions={
        isFiltered ? (
          <Button asChild variant="outline" size="lg">
            <Link href={PUBLIC_PATHS.gallery}>{text.emptyClear}</Link>
          </Button>
        ) : undefined
      }
    />
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
  query: GalleryQueryFilter;
  rws: readonly RwUnitSummary[];
}

// The items are fetched inside the Suspense boundary of the page, so a click on `Galeri` shows the header and
// the skeleton at once while the page renders per request (review of Task P5.6.05). A page past the last one is
// redirected from here, inside the stream: the count is known only with the items, and that address is one
// only `Muat lebih banyak` ever makes.
async function GalleryBody({ search, query, rws }: GalleryBodyProps) {
  const gallery = await listGalleryPages(query, search.page);
  if (gallery.pageCount < search.page)
    redirect(galleryPath({ ...search, page: gallery.pageCount }));
  const hasItems = gallery.items.length > 0;
  return (
    <Container className="space-y-8 pb-16 md:space-y-12 md:pb-28">
      <GalleryFilter
        active={search.filter}
        rws={rws}
        countLabel={
          hasItems ? text.count(gallery.items.length, canLoadMore(search, gallery)) : undefined
        }
      />
      {hasItems ? (
        <MasonryGrid items={gallery.items} rws={rws} />
      ) : (
        <GalleryEmpty isFiltered={search.filter !== null} />
      )}
      <LoadMore search={search} gallery={gallery} />
      <GalleryJsonLd search={search} items={gallery.items} />
    </Container>
  );
}

// The whole gallery, a category, or an RW that is online; NULL for the filter of an RW that is not.
function queryFor(search: GallerySearch, rws: readonly RwUnitSummary[]): GalleryQueryFilter | null {
  if (search.filter === null) return {};
  const query = galleryQueryFor(search.filter);
  if (query === null || ('owner' in query && !rws.some((rw) => rw.id === query.owner))) return null;
  return query;
}

// docs/PRD.md FR-PUB-14, Tasks P2.4.07 and P2.6.01. The page follows `?filter=` and `?halaman=`, so it is
// rendered per request, while every page of items it shows is a cached read (tags `galleries:*`). An address
// the page would not link to itself is redirected to the nearest valid one (decision of 2026-10-18), with a
// real 307: the checks that need no items run before anything streams (Task P5.6.05).
export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const { search, isCanonical } = readGallerySearch(await searchParams);
  if (!isCanonical) redirect(galleryPath(search));
  const rws = await listRwUnits();
  const query = queryFor(search, rws);
  // The middleware knows no RW, so the filter of an RW that is not online gets this far; it goes to the whole gallery.
  if (query === null) redirect(PUBLIC_PATHS.gallery);
  return (
    <>
      <PageHeader
        tone="paper"
        title={text.title}
        description={text.lead}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.gallery}
        crumb={TITLE}
      />
      <Suspense key={galleryPath(search)} fallback={<GallerySkeleton />}>
        <GalleryBody search={search} query={query} rws={rws} />
      </Suspense>
    </>
  );
}
