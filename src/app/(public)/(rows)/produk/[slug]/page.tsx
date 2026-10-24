import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { Breadcrumbs } from '@/components/layout/page-header';
import { RwTag } from '@/components/layout/rw-tag';
import { Section } from '@/components/layout/section';
import { CaptionedPhoto, PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { ShareButton } from '@/components/marketing/share-button';
import { TextBlock } from '@/components/marketing/text-block';
import { ProductAside } from '@/components/products/product-aside';
import { ProductCard } from '@/components/products/product-card';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { IMAGE_SIZES } from '@/config/images';
import { rwAccentClasses } from '@/config/rw';
import { PRODUCT_CATEGORY } from '@/config/status';
import { productDetailCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { publicMediaUrl } from '@/lib/images/public-media';
import { getProductBySlug, listProducts } from '@/lib/queries/products';
import { listRwUnits } from '@/lib/queries/rw-units';
import { getVendorBySlug } from '@/lib/queries/vendors';
import { breadcrumbListJsonLd, productJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { breadcrumbTrail } from '@/lib/utils/breadcrumbs';
import { productPath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ProductDetail, ProductSummary } from '@/types/product';
import type { RwUnitSummary } from '@/types/rw-unit';
import type { VendorProfile } from '@/types/vendor';

export const revalidate = 3600;

// "Produk lain": the other products of the same RW, at most four (one row).
const OTHER_PRODUCTS = 4;

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

// The title block: the trail, the RW, the category and the add-on tag, the name (the page's LCP) and its maker.
function TitleBlock({ product, rw }: { product: ProductDetail; rw: RwUnitSummary | undefined }) {
  const trail = breadcrumbTrail([{ name: 'Produk UMKM', path: PUBLIC_PATHS.products }], {
    name: product.name,
    path: productPath(product.slug),
  });
  return (
    <Container className="space-y-5 pt-6 pb-6 md:pt-10 md:pb-10">
      <Breadcrumbs trail={trail} />
      <div className="flex flex-wrap items-center gap-2">
        <RwTag rw={rw ?? product.rw} detail={rw?.shortName} />
        <Badge variant="tag">{PRODUCT_CATEGORY[product.category].label}</Badge>
        {product.isAddonEligible ? (
          <Badge variant="tag">{copy.catalogue.addonEligible}</Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-200 space-y-3">
          <h1 className="text-display text-balance">{product.name}</h1>
          {product.vendor ? (
            <p className="text-body-lg text-ink-2 md:text-xl">
              {copy.catalogue.vendorTitle} {product.vendor.name}
            </p>
          ) : null}
        </div>
        <div className="max-lg:-ml-5">
          <ShareButton title={product.name} />
        </div>
      </div>
      <JsonLd data={breadcrumbListJsonLd(trail)} />
    </Container>
  );
}

// The photo, or the RW-tinted `Foto menyusul` placeholder (DESIGN-SPEC §0: no product has a photo yet).
function ProductPhoto({ product }: { product: ProductDetail }) {
  if (product.cover) {
    return (
      <PhotoFrame
        image={product.cover}
        sizes={IMAGE_SIZES.main}
        aspectClassName="aspect-square rounded-2xl md:aspect-4/3"
        priority
      />
    );
  }
  return (
    <PhotoPlaceholder
      label={product.name}
      icon={PRODUCT_CATEGORY[product.category].icon}
      rws={[product.rw]}
      note={copy.catalogue.photoComing}
      iconClassName="size-12"
      className="aspect-square rounded-2xl md:aspect-4/3"
    />
  );
}

function ProductMain({ product }: { product: ProductDetail }) {
  return (
    <div className="min-w-0 flex-1 space-y-10">
      <ProductPhoto product={product} />
      {product.descriptionMd ? (
        <TextBlock text={product.descriptionMd} className="text-ink-2 md:text-lg" />
      ) : null}
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

// The vendor's public face only: name and description (docs/PRD.md FR-PUB-13, never contact or bank).
function VendorCard({ vendor }: { vendor: VendorProfile }) {
  return (
    <section
      aria-labelledby="pembuat-judul"
      className="space-y-2 rounded-2xl border border-border p-5 md:p-6"
    >
      <p className="text-meta-caps text-muted-foreground">{copy.catalogue.vendorTitle}</p>
      <h2 id="pembuat-judul" className="font-display text-xl font-bold">
        {vendor.name}
      </h2>
      {vendor.descriptionMd ? (
        <TextBlock text={vendor.descriptionMd} className="text-body text-ink-2" />
      ) : null}
    </section>
  );
}

function OtherProducts({ products }: { products: readonly ProductSummary[] }) {
  if (products.length === 0) return null;
  return (
    <Section
      id="produk-lain"
      tone="muted"
      eyebrow={text.otherEyebrow}
      title={text.otherTitle}
      size="compact"
    >
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
        {products.map((other) => (
          <li key={other.id} className="flex">
            <ProductCard product={other} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

// docs/PRD.md FR-PUB-13, Task P2.4.06; the product page in the catalogue's dress (DESIGN-SPEC §3.5–§3.6).
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const [product, rws, products] = await Promise.all([
    getProductBySlug(slug),
    listRwUnits(),
    listProducts(),
  ]);
  if (!product) notFound();
  const vendor = product.vendor ? await getVendorBySlug(product.vendor.slug) : null;
  const rw = rws.find((unit) => unit.id === product.rw.id);
  const others = products.filter(
    (other) => other.id !== product.id && other.rw.id === product.rw.id,
  );
  return (
    <>
      <div className={rwAccentClasses(product.rw.accentKey).scope}>
        <TitleBlock product={product} rw={rw} />
        <Container className="flex flex-col gap-10 pb-16 md:pb-24 lg:flex-row lg:items-start lg:gap-16">
          <ProductMain product={product} />
          <div className="space-y-6 lg:sticky lg:top-24 lg:w-105 lg:shrink-0">
            <ProductAside product={product} />
            {vendor ? <VendorCard vendor={vendor} /> : null}
          </div>
        </Container>
      </div>
      <OtherProducts products={others.slice(0, OTHER_PRODUCTS)} />
      <JsonLd data={productLd(product)} />
    </>
  );
}
