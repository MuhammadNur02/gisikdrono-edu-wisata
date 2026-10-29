import { HandCoins, Store } from 'lucide-react';

import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { productDetailCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import type { ProductDetail, ProductOrder } from '@/types/product';

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

// Where the order goes and how it is paid: picked up and paid for at the Kopdes, never through the site, so the site's
// QRIS/VA trust line does not belong here.
function OrderTerms({ order }: { order: ProductOrder }) {
  return (
    <div className="space-y-3 border-t border-border pt-6">
      <p className="text-body font-semibold">{text.orderTitle}</p>
      <ul className="space-y-2.5 text-body-sm text-ink-2">
        <li className="flex gap-2.5">
          <WhatsAppIcon className="mt-0.5 size-4.5 shrink-0 text-primary-ink" />
          {order.chatUrl === null ? text.orderAsk : text.orderHow}
        </li>
        <li className="flex gap-2.5">
          <Store aria-hidden className="mt-0.5 size-4.5 shrink-0 text-primary-ink" />
          {text.pickup(order.pickupAddress)}
        </li>
        <li className="flex gap-2.5">
          <HandCoins aria-hidden className="mt-0.5 size-4.5 shrink-0 text-primary-ink" />
          {text.payAtKopdes}
        </li>
      </ul>
    </div>
  );
}

// The order button: a plain wa.me link to the Kopdes with the message written (no server call, nothing about the
// visitor in it). While the Kopdes has no number, the question goes to the site's own WhatsApp instead; a product not
// on sale has no button at all, only a neutral line.
function OrderButton({ product, order }: { product: ProductDetail; order: ProductOrder }) {
  if (!product.isAvailable) {
    return <p className="text-body-sm text-muted-foreground">{text.orderUnavailable}</p>;
  }
  if (order.chatUrl === null) {
    return (
      <WhatsAppLinkButton
        size="lg"
        label={copy.catalogue.askOnWhatsApp}
        message={copy.layout.whatsAppGreeting(product.name)}
      />
    );
  }
  return (
    <Button asChild variant="whatsapp" size="lg">
      <a
        href={order.chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={text.orderButtonLabel(product.name)}
      >
        <WhatsAppIcon className="size-4.5" />
        {text.orderButton}
      </a>
    </Button>
  );
}

// docs/StyleGuide.md §5.9, DESIGN-SPEC §3.6: no cart. The panel of the product page (the surface, radius 20, the panel
// shadow from md): the price in Jakarta 36/800 with its unit, how it is ordered (decision of 2026-10-29: through the
// WhatsApp of the Koperasi Merah Putih, picked up and paid for there), and the button that does it.
export function ProductAside({ product, order }: { product: ProductDetail; order: ProductOrder }) {
  return (
    <aside className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-7 md:shadow-panel">
      <PriceBlock product={product} />
      <OrderTerms order={order} />
      <div className="flex flex-col gap-3">
        <OrderButton product={product} order={order} />
      </div>
    </aside>
  );
}
