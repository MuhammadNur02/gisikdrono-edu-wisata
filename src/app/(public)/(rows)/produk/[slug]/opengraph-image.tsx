import { OG_CONTENT_TYPE, OG_SIZE } from '@/config/og';
import { getProductBySlug } from '@/lib/queries/products';
import { renderOgImage } from '@/lib/seo/og-image';
import { formatIDR } from '@/lib/utils/currency';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Produk UMKM Edu Wisata Gisikdrono';

interface ProductImageProps {
  params: Promise<{ slug: string }>;
}

// docs/StyleGuide.md §8.4, Task P2.4.06: the RW, the product name and its price per unit. No seller: since the
// decision of 2026-10-29 the public site names none.
export default async function ProductOpenGraphImage({ params }: ProductImageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return renderOgImage({
    eyebrow: product?.rw.label ?? 'Produk UMKM',
    title: product?.name ?? 'Produk UMKM',
    detail: product ? `${formatIDR(product.price)} /${product.unitLabel}` : undefined,
  });
}
