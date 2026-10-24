import { ShoppingBag } from 'lucide-react';
import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogueState } from '@/components/marketing/catalogue-state';
import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { ProductCatalogue } from '@/components/products/product-catalogue';
import { NoCartNote, VendorSection } from '@/components/products/product-list-sections';
import { JsonLd } from '@/components/seo/json-ld';
import { productsPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { listProducts } from '@/lib/queries/products';
import { listRwUnits } from '@/lib/queries/rw-units';
import { listVendors } from '@/lib/queries/vendors';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { productPath, PUBLIC_PATHS } from '@/lib/utils/paths';

export const revalidate = 3600;

const TITLE = 'Produk UMKM';
const DESCRIPTION =
  'Produk usaha warga kampung-kampung edukasi Gisikdrono. Produk yang bisa jadi tambahan dipesan bersama paket kunjungan.';

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
// in the browser, the full list without script; then the vendors behind them.
export default async function ProductsPage() {
  const [products, rws, vendors] = await Promise.all([
    listProducts(),
    listRwUnits(),
    listVendors(),
  ]);
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
          <VendorSection vendors={vendors} products={products} rws={rws} />
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
