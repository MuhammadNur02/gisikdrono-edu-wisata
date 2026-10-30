import { ArrowRight, CalendarDays, QrCode, UserRoundCheck } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { WhatsAppLinkButton } from '@/components/marketing/whatsapp-link-button';
import { Button } from '@/components/ui/button';
import { packagesPageCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatIDR } from '@/lib/utils/currency';
import { describePackagePrice } from '@/lib/utils/package-price';
import type { PackageSummary } from '@/types/package';

export const STEPS_SECTION_ID = 'cara-memesan';

interface SummaryCell {
  value: string;
  label: string;
}

// The lowest price per person among the packages priced per person: the `harga mulai` of the summary box.
function lowestPerPersonPrice(packages: readonly PackageSummary[]): number | null {
  const amounts = packages.flatMap((pkg) => {
    const price = describePackagePrice(pkg);
    return price?.basis === 'orang' ? [price.amount] : [];
  });
  return amounts.length > 0 ? Math.min(...amounts) : null;
}

function summaryCells(packages: readonly PackageSummary[]): SummaryCell[] {
  const kampung = new Set(packages.flatMap((pkg) => pkg.rws.map((rw) => rw.id)));
  const fromPrice = lowestPerPersonPrice(packages);
  return [
    { value: String(packages.length), label: text.summaryPackages },
    { value: String(kampung.size), label: text.summaryKampung },
    ...(fromPrice === null ? [] : [{ value: formatIDR(fromPrice), label: text.summaryFromPrice }]),
  ];
}

// The summary box beside the page head (DESIGN-SPEC §3.4): the surface, radius 14, three cells divided by hairlines,
// counted from the published packages, never written by hand.
export function PackageSummaryBox({ packages }: { packages: readonly PackageSummary[] }) {
  return (
    <dl
      aria-label={text.summaryLabel}
      className="inline-flex divide-x divide-border rounded-lg border border-border bg-card max-md:hidden"
    >
      {summaryCells(packages).map((cell) => (
        <div key={cell.label} className="flex flex-col-reverse gap-1 px-4 py-3 md:px-5 md:py-3.5">
          <dt className="text-caption text-muted-foreground">{cell.label}</dt>
          <dd className="font-display text-lg leading-none font-extrabold tabular-nums md:text-xl">
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// The institution banner (DESIGN-SPEC §3.4): the soga tint with the ink kawung at 7 %, the quotation explained, the way
// to the steps below and the WhatsApp button.
export function InstitutionBanner() {
  return (
    <Container className="pb-16 md:pb-28">
      <div className="kawung flex flex-col gap-6 rounded-2xl bg-rw13-tint p-6 kawung-7 kawung-ink md:p-9 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-10">
        <div className="max-w-150 space-y-2.5">
          <h2 className="font-display text-xl leading-tight font-bold text-rw13-strong md:text-2xl">
            {text.institutionTitle}
          </h2>
          <p className="text-body text-ink-2">{text.institutionBody}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
          <Button asChild variant="secondary">
            <Link href={`#${STEPS_SECTION_ID}`}>
              {text.institutionCta}
              <ArrowRight aria-hidden data-icon="trailing" />
            </Link>
          </Button>
          <WhatsAppLinkButton
            label={copy.layout.whatsAppChat}
            message={copy.layout.whatsAppGreeting(text.whatsAppTopic)}
            className="max-sm:hidden"
          />
        </div>
      </div>
    </Container>
  );
}

const STEP_ICONS = [CalendarDays, UserRoundCheck, QrCode] as const;
const STEPS_TITLE_ID = `${STEPS_SECTION_ID}-judul`;
const STEP_NUMBER_DIGITS = 2;

// One step: its rule (the first in brick), the number `01` and the icon, the title and the line under it. On phones
// the rule gives way to a row of number and text.
function StepItem({ step, index }: { step: { title: string; body: string }; index: number }) {
  const Icon = STEP_ICONS[index] ?? CalendarDays;
  const isFirst = index === 0;
  return (
    <li className="relative max-md:flex max-md:gap-5 md:pt-6">
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 origin-left reveal-rule max-md:hidden',
          isFirst ? 'bg-primary' : 'bg-border-strong',
        )}
      />
      <div className="flex items-center justify-between md:mb-4">
        <span
          className={cn(
            'font-display text-body-sm font-bold tabular-nums',
            isFirst ? 'text-primary-ink' : 'text-muted-foreground',
          )}
        >
          {String(index + 1).padStart(STEP_NUMBER_DIGITS, '0')}
        </span>
        <Icon aria-hidden className="size-5.5 text-ink-2 max-md:hidden" />
      </div>
      <div className="reveal space-y-2">
        <h3 className="text-h4 font-bold">{step.title}</h3>
        <p className="text-body-md text-ink-2">{step.body}</p>
      </div>
    </li>
  );
}

// "Cara memesan" (DESIGN-SPEC §3.4): three columns under a 2 px rule (the add-on step left with the decision of
// 2026-10-29), the first in brick; each rule draws itself from the left as the row comes into view, then the text
// rises.
export function BookingSteps() {
  return (
    <SectionShell id={STEPS_SECTION_ID} labelledBy={STEPS_TITLE_ID} tone="muted">
      <div className="space-y-10 md:space-y-14">
        <SectionHeading
          titleId={STEPS_TITLE_ID}
          eyebrow={text.stepsEyebrow}
          title={text.stepsTitle}
          size="compact"
        />
        <ol className="grid gap-8 reveal-stagger md:grid-cols-3 md:gap-6">
          {text.steps.map((step, index) => (
            <StepItem key={step.title} step={step} index={index} />
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}
