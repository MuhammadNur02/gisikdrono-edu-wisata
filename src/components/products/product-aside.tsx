import { ArrowRight, PackagePlus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { productDetailCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { rwFilterFor } from '@/lib/utils/catalogue-filters';
import { formatIDR } from '@/lib/utils/currency';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ProductDetail } from '@/types/product';

function OrderFacts({ product }: { product: ProductDetail }) {
  return (
    <ul className="space-y-1.5 text-body-sm text-ink-2">
      <li>
        {copy.catalogue.orderRange(product.minOrderQty, product.maxOrderQty, product.unitLabel)}
      </li>
      {product.leadTimeDays > 0 ? <li>{copy.catalogue.leadTime(product.leadTimeDays)}</li> : null}
    </ul>
  );
}

// `Rp15.000 / kantong` in Jakarta 36/800, then whether it is on sale and how much can be ordered.
function PriceBlock({ product }: { product: ProductDetail }) {
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm text-muted-foreground">
        <span className="font-display text-3xl leading-none font-extrabold tracking-tight text-foreground tabular-nums md:text-4xl">
          {formatIDR(product.price)}
        </span>
        / {product.unitLabel}
      </p>
      {product.isAvailable ? null : <Badge variant="neutral">{copy.catalogue.unavailable}</Badge>}
      <OrderFacts product={product} />
    </div>
  );
}

// docs/StyleGuide.md §5.9, DESIGN-SPEC §3.6: no cart. The panel of the product page (the surface, radius 20, the panel
// shadow from md): the price in Jakarta 36/800 with its unit, how it is ordered, and the way to do it: as an add-on of a
// package booking, which opens the catalogue on the product's own RW, or a question on WhatsApp.
export function ProductAside({ product }: { product: ProductDetail }) {
  return (
    <aside className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-7 md:shadow-panel">
      <PriceBlock product={product} />
      <div className="space-y-3 border-t border-border pt-6">
        <p className="text-body font-semibold">{text.orderTitle}</p>
        <p className="flex gap-2.5 text-body-sm text-ink-2">
          <PackagePlus aria-hidden className="mt-0.5 size-4.5 shrink-0 text-primary-ink" />
          {product.isAddonEligible ? text.orderAsAddon : text.orderAsk}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {product.isAddonEligible ? (
          <Button size="lg" asChild>
            <Link href={`${PUBLIC_PATHS.packages}?rw=${rwFilterFor(product.rw.id)}`}>
              {copy.catalogue.addOnHint}
              <ArrowRight aria-hidden data-icon="trailing" />
            </Link>
          </Button>
        ) : null}
        <WhatsAppLinkButton
          size="lg"
          label={copy.catalogue.askOnWhatsApp}
          message={copy.layout.whatsAppGreeting(product.name)}
        />
      </div>
      <p className="flex gap-2.5 text-caption text-muted-foreground">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-rw05" />
        {copy.layout.paymentTrust}
      </p>
    </aside>
  );
}
