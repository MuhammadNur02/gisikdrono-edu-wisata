import { ArrowRight, PackagePlus } from 'lucide-react';
import Link from 'next/link';

import { Section } from '@/components/layout/section';
import { SnapRail } from '@/components/marketing/snap-rail';
import { ProductCard } from '@/components/products/product-card';
import { Button } from '@/components/ui/button';
import { homeCopy } from '@/lib/copy/home';
import { cn } from '@/lib/utils/cn';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { ProductSummary } from '@/types/product';

export interface FeaturedProductsProps {
  id: string;
  products: readonly ProductSummary[];
}

function AllProductsButton({ className }: { className?: string }) {
  return (
    <Button variant="outline" asChild className={className}>
      <Link href={PUBLIC_PATHS.products}>
        {homeCopy.products.all}
        <ArrowRight data-icon="trailing" aria-hidden />
      </Link>
    </Button>
  );
}

// How an add-on is ordered, on night beside the cards: three numbered steps from md, one sentence on a phone. The step
// numbers settle in one after another (DESIGN-SPEC §4, Add-on panel).
function AddonPanel() {
  return (
    <aside className="kawung flex flex-col gap-5 rounded-lg bg-night p-7 text-white ring-on-dark kawung-6 md:reveal">
      <p className="flex items-center gap-3 md:flex-col md:items-start md:gap-5">
        <PackagePlus aria-hidden className="size-7 shrink-0 text-gold" />
        <span className="font-display text-xl leading-tight font-bold md:text-2xl">
          {homeCopy.products.panelTitle}
        </span>
      </p>
      <ol className="space-y-3.5 reveal-stagger max-md:hidden">
        {homeCopy.products.panelSteps.map((step, index) => (
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
      <p className="text-body-sm text-on-dark-2 md:hidden">{homeCopy.products.panelShort}</p>
    </aside>
  );
}

// md:contents takes the list out of the box tree; role="list" keeps it a list for assistive technology.
const ROW_CLASS =
  'flex snap-x snap-mandatory gap-4 overflow-x-auto scrollbar-none max-md:pr-container max-md:pl-container md:contents';

// docs/PRD.md FR-PUB-04 and the products the kelurahan marks is_featured (Task P2.4.01), DESIGN-SPEC §3.1 `Produk UMKM`:
// three cards and the add-on panel in one row from lg; on a phone the cards are a carousel of 220 px and the panel
// follows at full width.
export function FeaturedProducts({ id, products }: FeaturedProductsProps) {
  const rowId = `${id}-baris`;
  return (
    <Section
      id={id}
      eyebrow={homeCopy.products.eyebrow}
      title={homeCopy.products.title}
      description={homeCopy.products.description}
      headerAction={<AllProductsButton className="max-md:hidden" />}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-5 max-md:-mx-5 md:contents">
          <ul id={rowId} role="list" className={cn(ROW_CLASS, 'reveal-stagger')}>
            {products.map((product) => (
              <li key={product.id} className="flex w-55 shrink-0 snap-start md:w-auto md:reveal">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
          <SnapRail targetId={rowId} count={products.length} barsClassName="px-5 md:hidden" />
        </div>
        <AddonPanel />
      </div>
      <AllProductsButton className="w-full md:hidden" />
    </Section>
  );
}
