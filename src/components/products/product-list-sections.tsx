import { PackagePlus, ShoppingBag } from 'lucide-react';

import { RwTag } from '@/components/layout/rw-tag';
import { SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { TextBlock } from '@/components/marketing/text-block';
import { rwAccentClasses } from '@/config/rw';
import { productsPageCopy as text } from '@/lib/copy/catalogue';
import { cn } from '@/lib/utils/cn';
import type { ProductSummary } from '@/types/product';
import type { RwUnitSummary } from '@/types/rw-unit';
import type { VendorProfile } from '@/types/vendor';

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

// The night add-on panel that closes the grid (DESIGN-SPEC §3.6): how a product is ordered, in three numbered steps
// whose circles spring in one after another.
export function AddonPanel() {
  return (
    <div className="kawung flex w-full flex-col gap-4 rounded-lg bg-night p-4 text-white ring-on-dark kawung-6 md:gap-5 md:p-7">
      <PackagePlus aria-hidden className="size-7 text-gold" />
      <p className="font-display text-lg leading-tight font-bold md:text-2xl">{text.addonTitle}</p>
      <ol className="space-y-3.5 reveal-stagger">
        {text.addonSteps.map((step, index) => (
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

const INITIALS = 2;
const VENDORS_TITLE_ID = 'pelaku-umkm-judul';

// `BS` for Bank Sampah Lestari: the first letters of the first two words.
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, INITIALS)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

interface VendorRowProps {
  vendor: VendorProfile;
  rw: RwUnitSummary | undefined;
  productCount: number;
}

// A vendor row (DESIGN-SPEC §3.6): the 64 px rounded initials in the RW accent, the name, its description, the RW
// badge and the number of products. Pointed at, the avatar tilts and the top rule takes the RW's colour.
function VendorRow({ vendor, rw, productCount }: VendorRowProps) {
  return (
    <li
      className={cn(
        'group flex items-center gap-5 border-t border-border-strong py-7 transition-colors duration-240 hover:border-rw-fill md:gap-6',
        rw && rwAccentClasses(rw.accentKey).scope,
      )}
    >
      <span
        aria-hidden
        className="flex size-14 shrink-0 items-center justify-center self-start rounded-xl bg-rw-fill font-display text-lg font-extrabold text-white transition-transform duration-300 ease-spring-snappy group-hover:scale-104 group-hover:-rotate-3 md:size-16 md:self-center md:text-xl"
      >
        {initialsOf(vendor.name)}
      </span>
      <div className="min-w-0 flex-1 space-y-3 md:flex md:items-center md:gap-6 md:space-y-0">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-display text-xl leading-tight font-bold md:text-2xl">
            {vendor.name}
          </h3>
          {vendor.descriptionMd ? (
            <TextBlock text={vendor.descriptionMd} className="space-y-1 text-body text-ink-2" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 md:shrink-0 md:gap-8">
          {rw ? <RwTag rw={rw} detail={rw.shortName} /> : null}
          <p className="text-body-sm font-medium text-ink-2">{text.vendorProducts(productCount)}</p>
        </div>
      </div>
    </li>
  );
}

export interface VendorSectionProps {
  vendors: readonly VendorProfile[];
  products: readonly ProductSummary[];
  rws: readonly RwUnitSummary[];
}

// "Pelaku UMKM" (DESIGN-SPEC §3.6): the vendors behind the products shown, with how many each one makes.
export function VendorSection({ vendors, products, rws }: VendorSectionProps) {
  const shown = vendors.filter((vendor) =>
    products.some((product) => product.vendor?.slug === vendor.slug),
  );
  if (shown.length === 0) return null;
  return (
    <SectionShell id="pelaku-umkm" labelledBy={VENDORS_TITLE_ID} tone="muted">
      <div className="flex flex-col gap-10 lg:flex-row lg:gap-20">
        <SectionHeading
          titleId={VENDORS_TITLE_ID}
          eyebrow={text.vendorsEyebrow}
          title={text.vendorsTitle}
          description={text.vendorsLead}
          size="compact"
          className="lg:w-105 lg:shrink-0"
        />
        <ul className="min-w-0 flex-1 border-b border-border-strong">
          {shown.map((vendor) => (
            <VendorRow
              key={vendor.id}
              vendor={vendor}
              rw={rws.find((rw) => rw.id === vendor.rwId)}
              productCount={
                products.filter((product) => product.vendor?.slug === vendor.slug).length
              }
            />
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
