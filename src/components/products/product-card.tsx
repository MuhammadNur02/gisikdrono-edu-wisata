import Link from 'next/link';

import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { IMAGE_SIZES } from '@/config/images';
import { PRODUCT_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatIDR } from '@/lib/utils/currency';
import { productPath } from '@/lib/utils/paths';
import type { ProductSummary } from '@/types/product';

const COVER_ASPECT = 'aspect-square';

export interface ProductCardProps {
  product: ProductSummary;
}

function ProductCover({ product }: ProductCardProps) {
  // Products are made to order, so an unavailable one fades but stays readable (docs/StyleGuide.md §5.9).
  const fade = product.isAvailable ? undefined : 'opacity-60';
  return product.cover ? (
    <PhotoFrame
      image={product.cover}
      sizes={IMAGE_SIZES.card}
      aspectClassName={COVER_ASPECT}
      className={cn('rounded-none', fade)}
    />
  ) : (
    <PhotoPlaceholder
      label={product.name}
      icon={PRODUCT_CATEGORY[product.category].icon}
      rwIds={[product.rwId]}
      className={cn(COVER_ASPECT, 'rounded-none', fade)}
    />
  );
}

function ProductBadges({ product }: ProductCardProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline">{PRODUCT_CATEGORY[product.category].label}</Badge>
      {product.isAddonEligible ? (
        <Badge variant="info">{copy.catalogue.addonEligible}</Badge>
      ) : null}
      {product.isFeatured ? <Badge variant="secondary">{copy.catalogue.featured}</Badge> : null}
      {product.isAvailable ? null : <Badge variant="neutral">{copy.catalogue.unavailable}</Badge>}
    </div>
  );
}

// docs/StyleGuide.md §5.9: the vendor named on every card, the price with its unit, no cart. The name link
// stretches over the card, so the whole card opens the product.
export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card
      variant="interactive"
      className="relative w-full gap-4 overflow-hidden pt-0 md:gap-4 md:pt-0"
    >
      <ProductCover product={product} />
      <div className="space-y-2 px-5 md:px-6">
        {product.vendor ? (
          <p className="text-overline text-muted-foreground">{product.vendor.name}</p>
        ) : null}
        <h3 className="line-clamp-2 text-h4">
          <Link
            href={productPath(product.slug)}
            aria-label={`${copy.catalogue.viewProduct}: ${product.name}`}
            className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {product.name}
          </Link>
        </h3>
        <p className="text-body-sm text-muted-foreground">
          <span className="text-h4 text-foreground tabular-nums">{formatIDR(product.price)}</span> /
          {product.unitLabel}
        </p>
        <ProductBadges product={product} />
      </div>
    </Card>
  );
}
