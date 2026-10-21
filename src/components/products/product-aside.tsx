import { MessageCircle } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/config/site';
import { PRODUCT_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { rwFilterFor } from '@/lib/utils/catalogue-filters';
import { formatIDR } from '@/lib/utils/currency';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import { buildWhatsAppChatUrl } from '@/lib/utils/whatsapp';
import type { ProductDetail } from '@/types/product';

function OrderFacts({ product }: { product: ProductDetail }) {
  return (
    <ul className="space-y-1 text-body-sm text-muted-foreground">
      <li>
        {copy.catalogue.orderRange(product.minOrderQty, product.maxOrderQty, product.unitLabel)}
      </li>
      {product.leadTimeDays > 0 ? <li>{copy.catalogue.leadTime(product.leadTimeDays)}</li> : null}
    </ul>
  );
}

// docs/StyleGuide.md §5.9: no cart. A product is ordered as an add-on of a package booking, which opens the
// catalogue on the product's own RW, or asked about on WhatsApp.
export function ProductAside({ product }: { product: ProductDetail }) {
  const chatUrl = buildWhatsAppChatUrl(
    siteConfig.whatsappContactNumber,
    copy.layout.whatsAppGreeting(product.name),
  );
  return (
    <aside className="space-y-5 rounded-xl border border-border bg-card p-5 md:p-6 dark:border-white/5">
      <p className="text-body-sm text-muted-foreground">
        <span className="text-h3 text-foreground tabular-nums">{formatIDR(product.price)}</span> /
        {product.unitLabel}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{PRODUCT_CATEGORY[product.category].label}</Badge>
        {product.isAddonEligible ? (
          <Badge variant="info">{copy.catalogue.addonEligible}</Badge>
        ) : null}
        {product.isAvailable ? null : <Badge variant="neutral">{copy.catalogue.unavailable}</Badge>}
      </div>
      <OrderFacts product={product} />
      <div className="flex flex-col gap-3">
        {product.isAddonEligible ? (
          <Button size="lg" asChild>
            <Link href={`${PUBLIC_PATHS.packages}?rw=${rwFilterFor(product.rw.id)}`}>
              {copy.catalogue.addOnHint}
            </Link>
          </Button>
        ) : null}
        <Button size="lg" variant="success" asChild>
          <a href={chatUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {copy.catalogue.askOnWhatsApp}
          </a>
        </Button>
      </div>
    </aside>
  );
}
