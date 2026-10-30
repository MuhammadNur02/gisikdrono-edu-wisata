import { ShoppingBag } from 'lucide-react';
import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { ProductCatalogue } from '@/components/products/product-catalogue';
import { NoCartNote } from '@/components/products/product-list-sections';
import { JsonLd } from '@/components/seo/json-ld';
import { productsPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { listProducts } from '@/lib/queries/products';
import { listRwUnits } from '@/lib/queries/rw-units';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { productPath, PUBLIC_PATHS } from '@/lib/utils/paths';

export const revalidate = 3600;

const TITLE = 'Produk UMKM';
const DESCRIPTION =
  'Produk usaha warga kampung-kampung edukasi Gisikdrono, dipesan lewat WhatsApp Koperasi Merah Putih lalu diambil dan dibayar di koperasi.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.products,
});

// With nothing published yet the page says so and offers WhatsApp (DESIGN-SPEC §3.14), rather than a bare head.
function NoProductsYet() {
  return (
    <Container className="border-t border-border pb-16 rw-scope-combo">
      <CatalogueState
        icon={ShoppingBag}
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

// docs/PRD.md FR-PUB-13, Task P2.4.06, DESIGN-SPEC §3.6: prerendered with every published product, filtered and searched
// in the browser, the full list without script. No vendor section: since the decision of 2026-10-29 the public site
// names no seller.
export default async function ProductsPage() {
  const [products, rws] = await Promise.all([listProducts(), listRwUnits()]);
  const hasProducts = products.length > 0;
  return (
    <>
      <PageHeader
        tone="paper"
        title={text.title}
        description={text.lead}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.products}
        crumb={TITLE}
        aside={<NoCartNote />}
      />
      {hasProducts ? (
        <>
          <ProductCatalogue products={products} rws={rws} />
          <JsonLd
            data={itemListJsonLd(
              products.map((product) => ({ name: product.name, path: productPath(product.slug) })),
            )}
          />
        </>
      ) : (
        <NoProductsYet />
      )}
    </>
  );
}
