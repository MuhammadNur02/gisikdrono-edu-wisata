import Link from 'next/link';

import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { ProductPriceText } from '@/components/products/product-price';
import { Card } from '@/components/ui/card';
import { PRODUCT_CATEGORY } from '@/config/status';
import { productPath } from '@/lib/utils/paths';
import type { ProductSummary } from '@/types/product';

// The 160 px square of the compact ProductCard (docs/StyleGuide.md §5.9).
const THUMB_SIZES = '160px';

export interface HeroProductCardProps {
  product: ProductSummary;
}

// The UMKM product a hero slide features, on the one glass card the screen may have (§1.3 G3). It sits at the
// top right of the slide's container from lg only, in line with the page content: on a phone it would cover the
// title (§5.7).
export function HeroProductCard({ product }: HeroProductCardProps) {
  return (
    <Card
      variant="glass"
      className="absolute top-8 right-8 hidden w-72 flex-row items-center gap-4 p-4 text-foreground lg:flex"
    >
      {product.cover ? (
        <PhotoFrame
          image={product.cover}
          sizes={THUMB_SIZES}
          aspectClassName="aspect-square"
          className="w-20 shrink-0"
        />
      ) : (
        <PhotoPlaceholder
          label={product.name}
          icon={PRODUCT_CATEGORY[product.category].icon}
          rws={[product.rw]}
          iconClassName="size-6"
          className="aspect-square w-20 shrink-0"
        />
      )}
      <div className="min-w-0 space-y-1">
        <Link
          href={productPath(product.slug)}
          className="line-clamp-2 text-body-sm font-medium underline-offset-4 hover:underline"
        >
          {product.name}
        </Link>
        <ProductPriceText
          price={product.price}
          unitLabel={product.unitLabel}
          look="compact"
          className="text-foreground"
        />
      </div>
    </Card>
  );
}
