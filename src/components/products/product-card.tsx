import Link from 'next/link';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { Badge } from '@/components/ui/badge';
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
  return (
    <div className="relative overflow-hidden rounded-lg">
      {product.cover ? (
        <PhotoFrame
          image={product.cover}
          sizes={IMAGE_SIZES.card}
          aspectClassName={COVER_ASPECT}
          className={cn('rounded-none', fade)}
          imageClassName="hover-zoom"
        />
      ) : (
        <PhotoPlaceholder
          label={product.name}
          icon={PRODUCT_CATEGORY[product.category].icon}
          rws={[product.rw]}
          note={copy.catalogue.photoComing}
          iconClassName="transition-transform duration-500 ease-out-soft motion-safe:group-hover:scale-108"
          className={cn(COVER_ASPECT, 'rounded-none', fade)}
        />
      )}
      <RwTag rw={product.rw} tone="surface" className="absolute top-3.5 left-3.5" />
    </div>
  );
}

// Card/Product of DESIGN-SPEC §2.5 (docs/StyleGuide.md §5.9): the square photo, or the RW-tinted placeholder with
// `Foto menyusul`, with the RW badge on the surface; the name and the price with its unit. No cart, and no seller:
// the product page orders it from the Koperasi Merah Putih (decisions of 2026-10-29). The name link stretches over
// the card, so the whole card opens the product.
export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="group relative flex h-full w-full hover-rise flex-col">
      <ProductCover product={product} />
      <div className="flex flex-1 flex-col gap-1.5 pt-4">
        <h3 className="font-display text-lg font-semibold text-balance transition-colors duration-200 group-hover:text-primary-ink">
          <Link
            href={productPath(product.slug)}
            aria-label={`${copy.catalogue.viewProduct}: ${product.name}`}
            className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring"
          >
            {product.name}
          </Link>
        </h3>
        <p className="text-body-sm text-muted-foreground">
          <span className="font-display text-lg font-bold text-foreground tabular-nums">
            {formatIDR(product.price)}
          </span>{' '}
          / {product.unitLabel}
        </p>
        {product.isAvailable ? null : (
          <Badge variant="neutral" size="sm" className="mt-1">
            {copy.catalogue.unavailable}
          </Badge>
        )}
      </div>
    </article>
  );
}
