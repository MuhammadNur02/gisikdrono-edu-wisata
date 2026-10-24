import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';

import { BookletCard } from '@/components/booklet/booklet-card';
import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { JsonLd } from '@/components/seo/json-ld';
import { bookletsPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { listBooklets } from '@/lib/queries/booklets';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { bookletPath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { BookletSummary } from '@/types/booklet';

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

function BookletGrid({ booklets }: { booklets: readonly BookletSummary[] }) {
  return (
    <>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    </>
  );
}

function NoBookletsYet() {
  return (
    <CatalogueState
      icon={BookOpen}
      tone="rw"
      className="rw-scope-combo"
      title={text.emptyTitle}
      description={text.emptyBody}
      actions={
        <WhatsAppLinkButton
          size="lg"
          label={text.emptyAsk}
          message={copy.layout.whatsAppGreeting(text.whatsAppTopic)}
        />
      }
    />
  );
}

// docs/PRD.md FR-PUB-07, FR-PUB-15, Task P2.4.08, in the list pattern of DESIGN-SPEC §3.4: the paper head and a grid of
// editorial cards; with nothing published, the empty state with WhatsApp.
export default async function BookletsPage() {
  const booklets = await listBooklets();
  return (
    <>
      <PageHeader
        tone="paper"
        title={text.title}
        description={text.lead}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.booklets}
        crumb={TITLE}
      />
      <Container className="border-t border-border pt-10 pb-16 md:pt-14 md:pb-28">
        {booklets.length > 0 ? <BookletGrid booklets={booklets} /> : <NoBookletsYet />}
      </Container>
    </>
  );
}
