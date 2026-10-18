import { Section } from '@/components/layout/section';
import { SectionLink } from '@/components/marketing/section-link';
import { ProductGrid } from '@/components/products/product-grid';
import type { ProductSummary } from '@/types/product';

export interface FeaturedProductsProps {
  id: string;
  products: readonly ProductSummary[];
}

// The UMKM products the kelurahan marks `is_featured` (Task P2.4.01).
export function FeaturedProducts({ id, products }: FeaturedProductsProps) {
  return (
    <Section id={id} eyebrow="Produk UMKM" title="Produk unggulan warga">
      <ProductGrid products={products} />
      <SectionLink href="/produk" label="Lihat semua produk UMKM" />
    </Section>
  );
}
