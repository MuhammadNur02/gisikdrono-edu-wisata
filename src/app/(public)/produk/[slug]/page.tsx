import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { RwTag } from '@/components/layout/rw-tag';
import { CaptionedPhoto, Photo } from '@/components/marketing/photo';
import { TextBlock } from '@/components/marketing/text-block';
import { ProductAside } from '@/components/products/product-aside';
import { JsonLd } from '@/components/seo/json-ld';
import { IMAGE_SIZES } from '@/config/images';
import { PRODUCT_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { publicMediaUrl } from '@/lib/images/public-media';
import { getProductBySlug, listProducts } from '@/lib/queries/products';
import { getVendorBySlug } from '@/lib/queries/vendors';
import { productJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { productPath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ProductDetail } from '@/types/product';
import type { VendorProfile } from '@/types/vendor';

export const revalidate = 3600;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const products = await listProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  return buildPageMetadata({
    title: product.name,
    description: product.vendor ? `${product.name} dari ${product.vendor.name}` : undefined,
    path: productPath(product.slug),
  });
}

// The vendor's public face only: name, description, logo (docs/PRD.md FR-PUB-13, never contact or bank).
function VendorCard({ vendor }: { vendor: VendorProfile }) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-5 md:p-6 dark:border-white/5">
      <p className="text-overline text-muted-foreground">{copy.catalogue.vendorTitle}</p>
      <h2 className="text-h4">{vendor.name}</h2>
      {vendor.descriptionMd ? (
        <TextBlock text={vendor.descriptionMd} className="text-body" />
      ) : null}
    </section>
  );
}

function productLd(product: ProductDetail) {
  return productJsonLd({
    name: product.name,
    description: product.descriptionMd ?? undefined,
    path: productPath(product.slug),
    imageUrls: product.images.map((image) => publicMediaUrl(image.path)),
    brandName: product.vendor?.name,
    offer: {
      priceIdr: product.price,
      path: productPath(product.slug),
      isAvailable: product.isAvailable,
    },
  });
}

// The photo, the description and any further photos, each only when the CMS has it (StyleGuide §6.9).
function ProductMain({ product }: { product: ProductDetail }) {
  return (
    <div className="space-y-8 lg:col-span-2">
      <Photo
        image={product.cover}
        caption={product.name}
        placeholder={{ icon: PRODUCT_CATEGORY[product.category].icon, rwIds: [product.rwId] }}
        sizes={IMAGE_SIZES.main}
        aspectClassName="aspect-square md:aspect-4/3"
        priority
      />
      {product.descriptionMd ? <TextBlock text={product.descriptionMd} /> : null}
      {product.images.length > 1 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {product.images.slice(1).map((image) => (
            <li key={image.path}>
              <CaptionedPhoto
                image={image}
                caption={product.name}
                sizes={IMAGE_SIZES.card}
                aspectClassName="aspect-square"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// docs/PRD.md FR-PUB-13, Task P2.4.06.
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const vendor = product.vendor ? await getVendorBySlug(product.vendor.slug) : null;
  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            <RwTag rwId={product.rwId} />
            {product.vendor?.name}
          </span>
        }
        title={product.name}
        breadcrumbs={[{ name: 'Produk UMKM', path: PUBLIC_PATHS.products }]}
        path={productPath(product.slug)}
      />
      <Container className="grid gap-10 pb-16 md:pb-24 lg:grid-cols-3">
        <ProductMain product={product} />
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <ProductAside product={product} />
          {vendor ? <VendorCard vendor={vendor} /> : null}
        </div>
      </Container>
      <JsonLd data={productLd(product)} />
    </>
  );
}
