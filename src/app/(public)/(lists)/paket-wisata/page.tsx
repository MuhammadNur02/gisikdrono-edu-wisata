import { PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { PackageCatalogue } from '@/components/packages/package-catalogue';
import {
  BookingSteps,
  InstitutionBanner,
  PackageSummaryBox,
} from '@/components/packages/package-list-sections';
import { JsonLd } from '@/components/seo/json-ld';
import { packagesPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { listPackages } from '@/lib/queries/packages';
import { listRwUnits } from '@/lib/queries/rw-units';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { packagePath, PUBLIC_PATHS } from '@/lib/utils/paths';

export const revalidate = 3600;

const TITLE = 'Paket wisata';
const DESCRIPTION =
  'Paket kunjungan edukasi ke satu kampung atau gabungan beberapa kampung di Kelurahan Gisikdrono, dengan harga per orang atau per rombongan.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.packages,
});

// With nothing published yet the page says so and offers WhatsApp (DESIGN-SPEC §3.14), rather than a bare head.
function NoPackagesYet() {
  return (
    <Container className="border-t border-border pb-16 rw-scope-combo">
      <CatalogueState
        icon={PackageSearch}
        tone="rw"
        title={text.emptyAllTitle}
        description={text.emptyAllBody}
        actions={
          <WhatsAppLinkButton
            size="lg"
            label={text.emptyAsk}
            message={copy.layout.whatsAppGreeting(text.whatsAppTopic)}
          />
        }
      />
    </Container>
  );
}

// docs/PRD.md FR-PUB-11, Task P2.4.05, DESIGN-SPEC §3.4. The page is prerendered with every package; the filters read
// the URL in the browser and narrow the same list, so the page stays cacheable. Until the island loads, and without
// script, the full list shows.
export default async function PackagesPage() {
  const [packages, rws] = await Promise.all([listPackages(), listRwUnits()]);
  const hasPackages = packages.length > 0;
  return (
    <>
      <PageHeader
        tone="paper"
        title={text.title}
        description={text.lead}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.packages}
        crumb={TITLE}
        aside={hasPackages ? <PackageSummaryBox packages={packages} /> : undefined}
      />
      {hasPackages ? (
        <>
          <PackageCatalogue packages={packages} rws={rws} />
          <InstitutionBanner />
          <JsonLd
            data={itemListJsonLd(
              packages.map((pkg) => ({ name: pkg.name, path: packagePath(pkg.slug) })),
            )}
          />
        </>
      ) : (
        <NoPackagesYet />
      )}
      <BookingSteps />
    </>
  );
}
