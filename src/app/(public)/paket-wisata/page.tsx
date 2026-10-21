import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { PackageCatalogue } from '@/components/packages/package-catalogue';
import { JsonLd } from '@/components/seo/json-ld';
import { listPackages } from '@/lib/queries/packages';
import { listRwUnits } from '@/lib/queries/rw-units';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { packagePath, PUBLIC_PATHS } from '@/lib/utils/paths';

export const revalidate = 3600;

const TITLE = 'Paket wisata';
const DESCRIPTION =
  'Paket kunjungan edukasi ke RW 05 Ecowastreme, RW 08 Kampung Seni Budaya, atau kombinasi keduanya, dengan harga per orang atau per rombongan.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.packages,
});

// docs/PRD.md FR-PUB-11, Task P2.4.05. The page is prerendered with every package; the filters read the URL in
// the browser and narrow the same list, so the page stays cacheable. Until the island loads, and without
// script, the full list shows. With no package published the page is its header alone (StyleGuide §6.9).
export default async function PackagesPage() {
  const [packages, rws] = await Promise.all([listPackages(), listRwUnits()]);
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.packages}
      />
      {packages.length > 0 ? (
        <Container className="pb-16 md:pb-24">
          <PackageCatalogue packages={packages} rws={rws} />
          <JsonLd
            data={itemListJsonLd(
              packages.map((pkg) => ({ name: pkg.name, path: packagePath(pkg.slug) })),
            )}
          />
        </Container>
      ) : null}
    </>
  );
}
