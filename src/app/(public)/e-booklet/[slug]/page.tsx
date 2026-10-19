import { BookOpen, Download } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Flipbook } from '@/components/booklet/flipbook';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { RwTag } from '@/components/layout/rw-tag';
import { Photo } from '@/components/marketing/photo';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { getBookletBySlug, listBooklets } from '@/lib/queries/booklets';
import { digitalDocumentJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { formatFileSize } from '@/lib/utils/file-size';
import { bookletDownloadPath, bookletPath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { BookletDetail } from '@/types/booklet';

export const revalidate = 86400;

interface BookletPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const booklets = await listBooklets();
  return booklets.map((booklet) => ({ slug: booklet.slug }));
}

export async function generateMetadata({ params }: BookletPageProps): Promise<Metadata> {
  const { slug } = await params;
  const booklet = await getBookletBySlug(slug);
  if (!booklet) return {};
  return buildPageMetadata({
    title: booklet.title,
    description: booklet.description ?? undefined,
    path: bookletPath(booklet.slug),
  });
}

function BookletEyebrow({ booklet }: { booklet: BookletDetail }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {BOOKLET_KIND_LABELS[booklet.kind]}
      {booklet.rwId ? <RwTag rwId={booklet.rwId} /> : null}
    </span>
  );
}

// A plain link: the route counts the download and redirects to the file, so it is never prefetched.
function DownloadButton({ booklet }: { booklet: BookletDetail }) {
  const facts = [
    booklet.pageCount ? copy.booklet.pages(booklet.pageCount) : null,
    booklet.fileSizeBytes ? `PDF ${formatFileSize(booklet.fileSizeBytes)}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button size="lg" asChild>
        <a href={bookletDownloadPath(booklet.id)} rel="nofollow">
          <Download aria-hidden />
          {copy.booklet.download}
        </a>
      </Button>
      {facts.length > 0 ? (
        <span className="text-body-sm text-muted-foreground">{facts.join(' · ')}</span>
      ) : null}
    </div>
  );
}

// Until the pages are uploaded the cover stands in for the flipbook (docs/StyleGuide.md §5.12).
function BookletBody({ booklet }: { booklet: BookletDetail }) {
  if (booklet.pagePaths.length > 0) {
    return <Flipbook title={booklet.title} pagePaths={booklet.pagePaths} />;
  }
  return (
    <Photo
      image={booklet.cover}
      caption={booklet.title}
      placeholder={{ icon: BookOpen, rwIds: booklet.rwId ? [booklet.rwId] : [] }}
      sizes={IMAGE_SIZES.split}
      aspectClassName="aspect-3/4"
      fit="contain"
      className="mx-auto max-w-md"
    />
  );
}

// docs/PRD.md FR-PUB-15, Tasks P2.4.08 and P2.7.01.
export default async function BookletPage({ params }: BookletPageProps) {
  const { slug } = await params;
  const booklet = await getBookletBySlug(slug);
  if (!booklet) notFound();
  return (
    <>
      <PageHeader
        eyebrow={<BookletEyebrow booklet={booklet} />}
        title={booklet.title}
        description={booklet.description ?? undefined}
        breadcrumbs={[{ name: 'E-booklet', path: PUBLIC_PATHS.booklets }]}
        path={bookletPath(booklet.slug)}
      >
        <DownloadButton booklet={booklet} />
      </PageHeader>
      <Container className="pb-16 md:pb-24">
        <BookletBody booklet={booklet} />
      </Container>
      <JsonLd
        data={digitalDocumentJsonLd({
          name: booklet.title,
          description: booklet.description ?? undefined,
          path: bookletPath(booklet.slug),
          downloadPath: bookletDownloadPath(booklet.id),
        })}
      />
    </>
  );
}
