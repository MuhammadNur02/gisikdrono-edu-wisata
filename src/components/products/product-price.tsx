import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatIDR } from '@/lib/utils/currency';
import type { ProductPrice } from '@/types/product';

// The amount's type in each place a product price shows (docs/StyleGuide.md §5.9, DESIGN-SPEC §2.5, §3.6): the card's
// Jakarta 18/700, the product panel's Jakarta 36/800, the hero card's body line.
const AMOUNT_CLASSES = {
  card: 'font-display text-lg font-bold text-foreground tabular-nums',
  panel:
    'font-display text-3xl leading-none font-extrabold tracking-tight text-foreground tabular-nums md:text-4xl',
  compact: 'tabular-nums',
} as const;

export interface ProductPriceTextProps {
  price: ProductPrice;
  unitLabel: string;
  look: keyof typeof AMOUNT_CLASSES;
  className?: string;
}

// `Rp15.000 / kantong`, or `Harga belum ditentukan` for a product without a price, or nothing at all while the site
// shows no product prices (decision of 2026-10-30): the amount is not even in the props then, so no CSS hides it.
export function ProductPriceText({ price, unitLabel, look, className }: ProductPriceTextProps) {
  if (price.status === 'hidden') return null;
  if (price.status === 'unset') {
    return (
      <p className={cn('text-body-sm text-muted-foreground', className)}>
        {copy.catalogue.priceUnset}
      </p>
    );
  }
  return (
    <p
      className={cn(
        'flex flex-wrap items-baseline gap-x-1.5 text-body-sm text-muted-foreground',
        className,
      )}
    >
      <span className={AMOUNT_CLASSES[look]}>{formatIDR(price.amount)}</span>/ {unitLabel}
    </p>
  );
}
