import { ArrowRight, UsersRound } from 'lucide-react';
import Link from 'next/link';

import { Section, SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { PackageCard } from '@/components/packages/package-card';
import { ProductCard } from '@/components/products/product-card';
import { Button } from '@/components/ui/button';
import { rwNumber } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { RW_PAGE_VOICE, rwPageCopy } from '@/lib/copy/rw-page';
import { PUBLIC_PATHS } from '@/lib/utils/paths';
import type { PackageSummary } from '@/types/package';
import type { ProductSummary } from '@/types/product';
import type { RwUnitProfile } from '@/types/rw-unit';

// The products heading an RW names in rw_units.products_heading, `Produk UMKM` otherwise.
const DEFAULT_PRODUCTS_HEADING = 'Produk UMKM';
// The RW page shows two products beside its heading (DESIGN-SPEC §3.3); /produk has them all.
const RW_PRODUCT_CARDS = 2;

// For large or institutional groups, on forest beside the cards: WhatsApp and the booking guide (DESIGN-SPEC §3.3).
function HelpPanel({ chatUrl }: { chatUrl: string }) {
  return (
    <aside className="kawung flex flex-col gap-4 rounded-lg bg-forest-night p-7 text-white ring-on-dark kawung-7 md:reveal">
      <UsersRound aria-hidden className="size-7 text-rw05-hi" />
      <p className="font-display text-xl leading-tight font-bold md:text-2xl">
        {rwPageCopy.packages.helpTitle}
      </p>
      <p className="text-body-sm text-on-forest">{rwPageCopy.packages.helpBody}</p>
      <div className="mt-auto flex flex-col gap-3 pt-4">
        <Button variant="whatsapp" asChild className="w-full rounded-full">
          <a href={chatUrl} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-5" />
            {copy.layout.whatsAppChat}
          </a>
        </Button>
        <Button variant="onPhoto" asChild className="w-full">
          <Link href={PUBLIC_PATHS.packages}>
            {rwPageCopy.packages.howToBook}
            <ArrowRight data-icon="trailing" aria-hidden />
          </Link>
        </Button>
      </div>
    </aside>
  );
}

export interface RwPackagesProps {
  id: string;
  unit: RwUnitProfile;
  packages: readonly PackageSummary[];
  chatUrl: string;
}

// DESIGN-SPEC §3.3 Paket (#paket): the RW's own packages and the combinations that visit it, then the help panel.
export function RwPackages({ id, unit, packages, chatUrl }: RwPackagesProps) {
  return (
    <Section
      id={id}
      tone="muted"
      eyebrow={rwPageCopy.packages.eyebrow(unit.label)}
      title={rwPageCopy.packages.title(unit.shortName)}
      description={rwPageCopy.packages.description}
      className="scroll-mt-header-nav"
    >
      <ul className="grid grid-cols-1 gap-10 reveal-stagger md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {packages.map((pkg) => (
          <li key={pkg.id} className="flex reveal">
            <PackageCard pkg={pkg} />
          </li>
        ))}
        <li className="flex *:w-full">
          <HelpPanel chatUrl={chatUrl} />
        </li>
      </ul>
    </Section>
  );
}

export interface RwProductsProps {
  id: string;
  unit: RwUnitProfile;
  products: readonly ProductSummary[];
}

function AllProductsButton({ unit, className }: { unit: RwUnitProfile; className?: string }) {
  return (
    <Button variant="outline" asChild className={className}>
      <Link href={`${PUBLIC_PATHS.products}?rw=${rwNumber(unit.id)}`}>
        {rwPageCopy.products.all(unit.label)}
        <ArrowRight data-icon="trailing" aria-hidden />
      </Link>
    </Button>
  );
}

// DESIGN-SPEC §3.3 Produk (#produk): the heading and the link on the left, two products aligned to the end; a phone
// sets them two to a row under the heading.
export function RwProducts({ id, unit, products }: RwProductsProps) {
  const titleId = `${id}-judul`;
  const heading = unit.productsHeading ?? DEFAULT_PRODUCTS_HEADING;
  return (
    <SectionShell id={id} labelledBy={titleId} className="scroll-mt-header-nav">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-x-6">
        <div className="space-y-8 lg:col-span-5">
          <SectionHeading
            titleId={titleId}
            eyebrow={rwPageCopy.products.eyebrow(heading, unit.label)}
            title={RW_PAGE_VOICE[unit.id]?.productsTitle ?? rwPageCopy.products.fallbackTitle}
            description={rwPageCopy.products.description}
          />
          <AllProductsButton unit={unit} className="max-md:hidden" />
        </div>
        <ul className="grid grid-cols-2 gap-4 reveal-stagger md:gap-6 lg:col-span-6 lg:col-start-7">
          {products.slice(0, RW_PRODUCT_CARDS).map((product) => (
            <li key={product.id} className="flex reveal">
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
        <AllProductsButton unit={unit} className="w-full md:hidden" />
      </div>
    </SectionShell>
  );
}
