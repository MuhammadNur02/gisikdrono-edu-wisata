import { ProductCard } from '@/components/products/product-card';
import type { ProductSummary } from '@/types/product';

export interface ProductGridProps {
  products: readonly ProductSummary[];
}

// The card grid of docs/StyleGuide.md §4.2.
export function ProductGrid({ products }: ProductGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="flex">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
