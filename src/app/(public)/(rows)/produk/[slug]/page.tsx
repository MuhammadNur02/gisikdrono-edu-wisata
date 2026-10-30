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
import { VariantChoiceProvider } from '@/components/products/variant-choice';
import { VariantPhoto } from '@/components/products/variant-photo';
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
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { breadcrumbListJsonLd, productJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { breadcrumbTrail } from '@/lib/utils/breadcrumbs';
import { productPath, PUBLIC_PATHS } from '@/lib/utils/paths';
import { shownPriceAmount } from '@/lib/utils/product-price';
import { whatsAppDigitsOf } from '@/lib/utils/whatsapp';
import type { ProductDetail, ProductOrder, ProductSummary } from '@/types/product';
import type { RwUnitSummary } from '@/types/rw-unit';
import type { PublicSiteSettings } from '@/types/settings';

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
  return buildPageMetadata({ title: product.name, path: productPath(product.slug) });
}

// The Offer only with a price the site shows (decision of 2026-10-30): while prices are off, or for a product without
// one, the Product carries no offers at all, which schema.org allows, rather than a price of 0 or a hidden one.
function productLd(product: ProductDetail) {
  const amount = shownPriceAmount(product.price);
  return productJsonLd({
    name: product.name,
    description: product.descriptionMd ?? undefined,
    path: productPath(product.slug),
    imageUrls: product.images.map((image) => publicMediaUrl(image.path)),
    offer:
      amount === null
        ? undefined
        : { priceIdr: amount, path: productPath(product.slug), isAvailable: product.isAvailable },
  });
}

// The title block: the trail, the RW and the category, and the name (the page's LCP). No maker: since the decision of
// 2026-10-29 the public site names no seller.
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
      </div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-200 space-y-3">
          <h1 className="text-display text-balance">{product.name}</h1>
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

// A product with variants shows the chosen variant's photo in the same place (decision of 2026-10-30).
function ProductMain({ product }: { product: ProductDetail }) {
  return (
    <div className="min-w-0 flex-1 space-y-10">
      {product.variants.length > 0 ? (
        <VariantPhoto productName={product.name} fallback={<ProductPhoto product={product} />} />
      ) : (
        <ProductPhoto product={product} />
      )}
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

// docs/PRD.md FR-PUB-13a: the order goes to the Koperasi Merah Putih's WhatsApp with the product, its RW and the
// chosen variant written in; a number or address still holding its seeded placeholder reads as none.
function orderOf(settings: PublicSiteSettings): ProductOrder {
  return {
    whatsappDigits: whatsAppDigitsOf(settings.kopdesWhatsappNumber),
    pickupAddress: settings.kopdesAddress,
  };
}

// The photo and the panel share the chosen variant, so a product with variants has one small provider around both.
function ProductBody({ product, order }: { product: ProductDetail; order: ProductOrder }) {
  const body = (
    <Container className="flex flex-col gap-10 pb-16 md:pb-24 lg:flex-row lg:items-start lg:gap-16">
      <ProductMain product={product} />
      <div className="lg:sticky lg:top-24 lg:w-105 lg:shrink-0">
        <ProductAside product={product} order={order} />
      </div>
    </Container>
  );
  if (product.variants.length === 0) return body;
  return <VariantChoiceProvider variants={product.variants}>{body}</VariantChoiceProvider>;
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
  const [product, rws, products, settings] = await Promise.all([
    getProductBySlug(slug),
    listRwUnits(),
    listProducts(),
    getPublicSiteSettings(),
  ]);
  if (!product) notFound();
  const rw = rws.find((unit) => unit.id === product.rw.id);
  const others = products.filter(
    (other) => other.id !== product.id && other.rw.id === product.rw.id,
  );
  return (
    <>
      <div className={rwAccentClasses(product.rw.accentKey).scope}>
        <TitleBlock product={product} rw={rw} />
        <ProductBody product={product} order={orderOf(settings)} />
      </div>
      <OtherProducts products={others.slice(0, OTHER_PRODUCTS)} />
      <JsonLd data={productLd(product)} />
    </>
  );
}
