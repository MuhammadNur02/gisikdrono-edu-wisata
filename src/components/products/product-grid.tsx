import { CARD_GRID_CLASSES } from '@/components/marketing/catalogue-list';
import { ProductCard } from '@/components/products/product-card';
import type { ProductSummary } from '@/types/product';

export interface ProductGridProps {
  products: readonly ProductSummary[];
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <ul className={CARD_GRID_CLASSES.listClassName}>
      {products.map((product) => (
        <li key={product.id} className={CARD_GRID_CLASSES.itemClassName}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
