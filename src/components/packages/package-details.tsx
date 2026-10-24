import { Check, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { RwTag } from '@/components/layout/rw-tag';
import { TextBlock } from '@/components/marketing/text-block';
import { PACKAGE_CATEGORY } from '@/config/status';
import { packageDetailCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatIDR } from '@/lib/utils/currency';
import { describePackagePrice } from '@/lib/utils/package-price';
import type { PackageDetail } from '@/types/package';

interface DetailBlockProps {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}

// A section of the package page (DESIGN-SPEC §3.5): a hairline on top, 24 px, the title in Jakarta 28/700 (22 on
// phones) and, where the design has one, a small note under it.
function DetailBlock({ id, title, note, children }: DetailBlockProps) {
  return (
    <section aria-labelledby={id} className="space-y-6 border-t border-border pt-6">
      <div className="space-y-1.5">
        <h2 id={id} className="text-h3">
          {title}
        </h2>
        {note ? <p className="text-body-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

// `Termasuk`: 24 px circles in the RW's tint with a check (the package's RW scope sets it).
function CheckList({ items, label }: { items: readonly string[]; label?: string }) {
  return (
    <div className="space-y-4">
      {label ? <p className="text-meta-caps text-muted-foreground">{label}</p> : null}
      <ul className="grid gap-3.5 sm:grid-cols-2 sm:gap-x-8">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-body-md text-ink-2">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rw-soft text-rw"
            >
              <Check className="size-3.5" strokeWidth={2.5} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The itinerary (DESIGN-SPEC §3.5): the time in Jakarta 15/700 in the RW accent, a 2 px rail with 12 px dots (the
// first filled), the title and its line. A timeline never animates (§4).
function Itinerary({ pkg }: { pkg: PackageDetail }) {
  return (
    <ol className="space-y-0">
      {pkg.itinerary.map((step, index) => (
        <li key={`${String(step.order)}-${step.title}`} className="flex gap-3">
          <span className="w-14 shrink-0 pt-0.5 text-right font-display text-body-md font-bold text-rw tabular-nums">
            {step.time}
          </span>
          <span aria-hidden className="relative flex w-6 shrink-0 justify-center">
            <span
              className={cn(
                'relative z-10 mt-1.5 size-3 rounded-full border-2 border-rw-fill',
                index === 0 ? 'bg-rw-fill' : 'bg-background',
              )}
            />
            {index < pkg.itinerary.length - 1 ? (
              <span className="absolute top-4 bottom-0 w-0.5 bg-border" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1 space-y-1 pb-7">
            <h3 className="flex flex-wrap items-center gap-2 text-body font-semibold">
              {step.title}
              {step.rw && pkg.rws.length > 1 ? <RwTag rw={step.rw} size="sm" /> : null}
            </h3>
            {step.description ? (
              <p className="text-body-sm text-ink-2">{step.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface TierRow {
  key: string;
  who: string;
  range: string;
  amount: number;
}

// The real tiers of tour_package_price_tiers; without any, the one price the package has. Never a sample row.
function tierRows(pkg: PackageDetail): TierRow[] {
  const who = PACKAGE_CATEGORY[pkg.category].label;
  if (pkg.priceTiers.length > 0) {
    return pkg.priceTiers.map((tier) => ({
      key: String(tier.minPax),
      who,
      range: copy.catalogue.tierRange(tier.minPax, tier.maxPax),
      amount: tier.pricePerPax,
    }));
  }
  const price = describePackagePrice(pkg);
  return price
    ? [
        {
          key: 'base',
          who,
          range: copy.catalogue.paxRange(pkg.minPax, pkg.maxPax),
          amount: price.amount,
        },
      ]
    : [];
}

// The price table (radius 14, a hairline edge, the sunken head row). A table never animates (§4).
function PriceTable({ pkg }: { pkg: PackageDetail }) {
  const basis = describePackagePrice(pkg)?.basis ?? 'orang';
  const headClass = 'px-4 py-3 text-meta-caps font-semibold text-muted-foreground md:px-5';
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-muted">
          <tr>
            <th scope="col" className={headClass}>
              {text.priceColumns.who}
            </th>
            <th scope="col" className={headClass}>
              {text.priceColumns.minimum}
            </th>
            <th scope="col" className={cn(headClass, 'text-right')}>
              {text.priceColumns[basis]}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {tierRows(pkg).map((row) => (
            <tr key={row.key}>
              <td className="px-4 py-4 font-medium md:px-5">{row.who}</td>
              <td className="px-4 py-4 text-ink-2 tabular-nums md:px-5">{row.range}</td>
              <td className="px-4 py-4 text-right font-display text-body font-bold tabular-nums md:px-5">
                {formatIDR(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The FAQ (DESIGN-SPEC §3.5): native details rows with a Plus that turns into a Minus, the first one open.
function Faq() {
  return (
    <div>
      {text.faq.map((item, index) => (
        <details key={item.question} open={index === 0} className="faq-row border-b border-border">
          <summary className="flex min-h-13 items-center justify-between gap-4 py-4.5 text-body font-semibold focus-visible:outline-offset-4">
            {item.question}
            <Plus aria-hidden className="faq-plus size-5 shrink-0" />
            <Minus aria-hidden className="faq-minus size-5 shrink-0" />
          </summary>
          <p className="pb-5 text-body-md text-ink-2">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

// docs/PRD.md FR-PUB-12 (DESIGN-SPEC §3.5): what the visit holds. Each block shows only when the CMS filled it
// (docs/StyleGuide.md §6.9); the price table and the FAQ always show.
export function PackageDetails({ pkg }: { pkg: PackageDetail }) {
  const basis = describePackagePrice(pkg)?.basis ?? 'orang';
  return (
    <div className="space-y-14">
      {pkg.descriptionMd ? (
        <DetailBlock id="tentang" title={text.about}>
          <TextBlock
            text={pkg.descriptionMd}
            className="text-ink-2 md:text-lg md:leading-relaxed"
          />
        </DetailBlock>
      ) : null}
      {pkg.highlights.length > 0 ? (
        <DetailBlock id="kegiatan" title={text.highlights}>
          <CheckList items={pkg.highlights} />
        </DetailBlock>
      ) : null}
      {pkg.inclusions.length > 0 ? (
        <DetailBlock id="termasuk" title={text.included}>
          <CheckList items={pkg.inclusions} label={text.includedLabel} />
        </DetailBlock>
      ) : null}
      {pkg.itinerary.length > 0 ? (
        <DetailBlock
          id="alur"
          title={text.itinerary(pkg.durationMinutes)}
          note={text.itineraryNote}
        >
          <Itinerary pkg={pkg} />
        </DetailBlock>
      ) : null}
      <DetailBlock id="harga" title={text.prices[basis]} note={text.pricesNote}>
        <PriceTable pkg={pkg} />
      </DetailBlock>
      <DetailBlock id="tanya-jawab" title={text.faqTitle}>
        <Faq />
      </DetailBlock>
    </div>
  );
}
