import Link from 'next/link';

import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPending } from '@/components/marketing/photo-pending';
import { Card } from '@/components/ui/card';
import { formatIDR } from '@/lib/utils/currency';
import type { ProductSummary } from '@/types/product';

// The 160 px square of the compact ProductCard (docs/StyleGuide.md §5.9).
const THUMB_SIZES = '160px';

export interface HeroProductCardProps {
  product: ProductSummary;
}

// The UMKM product a hero slide features, on the one glass card the screen may have (§1.3 G3). It sits on
// the photo's right from lg only: on a phone it would cover the title (§5.7).
export function HeroProductCard({ product }: HeroProductCardProps) {
  return (
    <Card
      variant="glass"
      className="absolute top-6 right-6 hidden w-72 flex-row items-center gap-4 p-4 text-foreground lg:flex"
    >
      {product.cover ? (
        <PhotoFrame
          image={product.cover}
          sizes={THUMB_SIZES}
          aspectClassName="aspect-square"
          className="w-20 shrink-0"
        />
      ) : (
        <PhotoPending subject={product.name} className="aspect-square w-20 shrink-0 p-2" />
      )}
      <div className="min-w-0 space-y-1">
        {product.vendor ? (
          <p className="truncate text-overline text-muted-foreground">{product.vendor.name}</p>
        ) : null}
        <Link
          href={`/produk/${product.slug}`}
          className="line-clamp-2 text-body-sm font-medium underline-offset-4 hover:underline"
        >
          {product.name}
        </Link>
        <p className="text-body-sm tabular-nums">
          {formatIDR(product.price)} /{product.unitLabel}
        </p>
      </div>
    </Card>
  );
}
