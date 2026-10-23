import type { Metadata } from 'next';

import { BookletCard } from '@/components/booklet/booklet-card';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { JsonLd } from '@/components/seo/json-ld';
import { listBooklets } from '@/lib/queries/booklets';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { bookletPath, PUBLIC_PATHS } from '@/lib/utils/paths';

// docs/PRD.md §5.1: booklets change rarely, so their pages are rebuilt daily and on the `booklets` tag.
export const revalidate = 86400;

const TITLE = 'E-booklet';
const DESCRIPTION =
  'E-booklet, proposal kunjungan, dan daftar harga Edu Wisata Gisikdrono. Baca di halaman ini atau unduh PDF-nya.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.booklets,
});

// docs/PRD.md FR-PUB-07, FR-PUB-15, Task P2.4.08. With nothing published the page is its header alone
// (StyleGuide §6.9).
export default async function BookletsPage() {
  const booklets = await listBooklets();
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.booklets}
      />
      {booklets.length > 0 ? (
        <Container className="pb-16 md:pb-24">
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {booklets.map((booklet) => (
              <li key={booklet.id} className="flex">
                <BookletCard booklet={booklet} />
              </li>
            ))}
          </ul>
          <JsonLd
            data={itemListJsonLd(
              booklets.map((booklet) => ({ name: booklet.title, path: bookletPath(booklet.slug) })),
            )}
          />
        </Container>
      ) : null}
    </>
  );
}
