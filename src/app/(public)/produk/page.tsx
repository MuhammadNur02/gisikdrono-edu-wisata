import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { ProductCatalogue } from '@/components/products/product-catalogue';
import { JsonLd } from '@/components/seo/json-ld';
import { listProducts } from '@/lib/queries/products';
import { itemListJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { productPath, PUBLIC_PATHS } from '@/lib/utils/paths';

export const revalidate = 3600;

const TITLE = 'Produk UMKM';
const DESCRIPTION =
  'Produk usaha warga RW 05 dan RW 08. Produk yang bisa jadi tambahan dipesan bersama paket kunjungan.';

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PUBLIC_PATHS.products,
});

// docs/PRD.md FR-PUB-13, Task P2.4.06: prerendered with every published product, filtered in the browser, the
// full list without script. With nothing published the page is its header alone (StyleGuide §6.9).
export default async function ProductsPage() {
  const products = await listProducts();
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[]}
        path={PUBLIC_PATHS.products}
      />
      {products.length > 0 ? (
        <Container className="pb-16 md:pb-24">
          <ProductCatalogue products={products} />
          <JsonLd
            data={itemListJsonLd(
              products.map((product) => ({ name: product.name, path: productPath(product.slug) })),
            )}
          />
        </Container>
      ) : null}
    </>
  );
}
