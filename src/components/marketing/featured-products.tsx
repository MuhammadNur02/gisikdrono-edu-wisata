import { Section } from '@/components/layout/section';
import { RevealList } from '@/components/marketing/reveal';
import { SectionLink } from '@/components/marketing/section-link';
import { ProductCard } from '@/components/products/product-card';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ProductSummary } from '@/types/product';

export interface FeaturedProductsProps {
  id: string;
  products: readonly ProductSummary[];
}

// The card grid of docs/StyleGuide.md §4.2 from sm. Below sm the four square cards would make one very long
// column, so they become a scroll-snap row instead, the next card peeking in from the edge (decision of
// 2026-10-23); the row reaches the screen edge and starts in line with the content.
const ROW_CLASSES = {
  list: '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4',
  item: 'flex shrink-0 basis-3/4 snap-start sm:basis-auto',
};

// The UMKM products the kelurahan marks `is_featured` (Task P2.4.01).
export function FeaturedProducts({ id, products }: FeaturedProductsProps) {
  return (
    <Section
      id={id}
      wave={{ variant: 'gentle', flip: true }}
      eyebrow="Produk UMKM"
      title="Buatan warga, bisa jadi oleh-oleh rombongan"
      headerAction={<SectionLink href={PUBLIC_PATHS.products} label="Lihat semua produk UMKM" />}
    >
      <RevealList
        items={products.map((product) => ({
          key: product.id,
          node: <ProductCard product={product} />,
        }))}
        className={ROW_CLASSES.list}
        itemClassName={ROW_CLASSES.item}
      />
    </Section>
  );
}
