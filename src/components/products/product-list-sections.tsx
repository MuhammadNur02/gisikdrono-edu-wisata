import { ShoppingBag, Store } from 'lucide-react';

import { productsPageCopy as text } from '@/lib/copy/catalogue';

// The note beside the page head (DESIGN-SPEC §3.6): the surface, a 40 px brick-tint circle with the bag.
export function NoCartNote() {
  return (
    <div className="flex max-w-94 gap-4 rounded-lg border border-border bg-card p-5">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-ink"
      >
        <ShoppingBag className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-body-md font-semibold">{text.noCartTitle}</p>
        <p className="text-body-sm text-muted-foreground">{text.noCartBody}</p>
      </div>
    </div>
  );
}

// The night panel that closes the grid (DESIGN-SPEC §3.6): how a product is ordered since the decision of 2026-10-29,
// through the WhatsApp of the Koperasi Merah Putih and picked up and paid for there, in three numbered steps whose
// circles spring in one after another. There is no vendor section: the public site names no seller.
export function OrderPanel() {
  return (
    <div className="kawung flex w-full flex-col gap-4 rounded-lg bg-night p-4 text-white ring-on-dark kawung-6 md:gap-5 md:p-7">
      <Store aria-hidden className="size-7 text-gold" />
      <p className="font-display text-lg leading-tight font-bold md:text-2xl">{text.orderTitle}</p>
      <ol className="space-y-3.5 reveal-stagger">
        {text.orderSteps.map((step, index) => (
          <li key={step} className="flex gap-3 text-body-sm text-on-dark-2">
            <span
              aria-hidden
              className="flex size-6 shrink-0 reveal-scale items-center justify-center rounded-full border border-white/40 text-xs font-semibold text-white"
            >
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
