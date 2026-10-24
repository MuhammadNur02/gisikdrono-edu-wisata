'use client';

import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import type { QuotePreviewState } from '@/hooks/use-quote-preview';
import { bookingLayoutCopy } from '@/lib/copy/booking-layout';
import { copy } from '@/lib/copy/id';
import { sessionsOn, type BookingDraft } from '@/lib/utils/booking-wizard';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong, formatDateShort, formatTimeRange } from '@/lib/utils/dates';
import type { WizardPackage } from '@/types/booking';
import type { BookableLeg } from '@/types/session';

const text = bookingLayoutCopy.wizard.aside;
const DOT = ' · ';
const RW_JOINER = ' + ';
const paxText = copy.booking.wizard.summary.pax;

export interface WizardSummaryProps {
  wizardPackage: WizardPackage;
  // The package's thumbnail, name and meta line, drawn on the server (wizard-package-card.tsx).
  packageCard: ReactNode;
  draft: BookingDraft;
  legs: readonly BookableLeg[];
  preview: QuotePreviewState;
  // On the summary step the server's quote is the total itself, no longer an estimate.
  isFinal: boolean;
}

// The chosen session of each leg, "Sesi Pagi · 08.30–10.30 WIB", with the RW in front for a combo.
function chosenSessions(draft: BookingDraft, legs: readonly BookableLeg[]): string[] {
  if (!draft.visitDate) return [];
  const visitDate = draft.visitDate;
  return legs.flatMap((leg, index) => {
    const session = sessionsOn(leg, visitDate).find((each) => each.id === draft.sessionIds[index]);
    if (!session) return [];
    const parts = [formatTimeRange(session.startTime, session.endTime)];
    if (session.label) parts.unshift(session.label);
    if (legs.length > 1) parts.unshift(leg.rw.label);
    return [parts.join(DOT)];
  });
}

// The server's total, once it has priced the order; the wizard asks for it from the add-ons step on.
function quotedTotal(preview: QuotePreviewState): number | null {
  return preview.status === 'ready' && preview.answer.kind === 'quote'
    ? preview.answer.quote.total
    : null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 text-body-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function SummaryRows({ draft, legs }: Pick<WizardSummaryProps, 'draft' | 'legs'>) {
  const sessions = chosenSessions(draft, legs);
  return (
    <dl className="border-t border-border">
      <Row label={text.date}>
        {draft.visitDate ? formatDateLong(draft.visitDate) : text.notChosen}
      </Row>
      <Row label={text.session}>
        {sessions.length > 0
          ? sessions.map((session) => (
              <span key={session} className="block">
                {session}
              </span>
            ))
          : text.notChosen}
      </Row>
      <Row label={text.pax}>{paxText(draft.pax)}</Row>
      <Row label={text.addons}>
        {draft.addons.length > 0 ? text.addonCount(draft.addons.length) : text.noAddons}
      </Row>
    </dl>
  );
}

function EstimateRow({ preview, isFinal }: { preview: QuotePreviewState; isFinal: boolean }) {
  const total = quotedTotal(preview);
  return (
    <div className="space-y-2">
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-label font-semibold text-foreground">
          {isFinal ? text.total : text.estimate}
        </span>
        {total === null ? (
          <span className="text-right text-body-sm text-muted-foreground">
            {text.estimateLater}
          </span>
        ) : (
          <span className="text-h2 font-display font-extrabold tabular-nums">
            {formatIDR(total)}
          </span>
        )}
      </p>
      <p className="text-caption text-muted-foreground">{isFinal ? text.totalNote : text.note}</p>
    </div>
  );
}

function TrustNote() {
  return (
    <p className="flex gap-2.5 rounded-lg bg-muted p-4 text-caption text-ink-2">
      <ShieldCheck aria-hidden className="mt-0.5 size-4.5 shrink-0 text-rw05" />
      {text.trust}
    </p>
  );
}

// DESIGN-SPEC §2.10 Wizard Summary, from lg: the order as it stands, sticky beside the steps. Not animated and not a
// live region; the quote panel inside the step reads its total out.
export function WizardSummaryPanel(props: WizardSummaryProps) {
  return (
    <section
      aria-label={text.label}
      className="sticky top-24 space-y-4.5 rounded-2xl border border-border bg-card p-6"
    >
      {props.packageCard}
      <SummaryRows draft={props.draft} legs={props.legs} />
      <EstimateRow preview={props.preview} isFinal={props.isFinal} />
      <TrustNote />
    </section>
  );
}

// Below lg, the same summary as a bar under the progress: the package and the chosen day on the left, the total on
// the right, the rows when it is opened.
export function WizardSummaryBar(props: WizardSummaryProps) {
  const { wizardPackage, draft, legs, preview } = props;
  const total = quotedTotal(preview);
  const sessions = chosenSessions(draft, legs);
  const line = draft.visitDate
    ? [formatDateShort(draft.visitDate), ...sessions.slice(0, 1), paxText(draft.pax)].join(DOT)
    : wizardPackage.rws.map((rw) => rw.label).join(RW_JOINER);
  return (
    <details className="group border-b border-border bg-card lg:hidden">
      <summary className="mx-auto flex min-h-16 w-full max-w-300 cursor-pointer list-none items-center gap-4 px-5 py-3 md:px-10">
        <span className="min-w-0 flex-1">
          <span className="block truncate py-0.5 text-label font-semibold text-foreground">
            {wizardPackage.name}
          </span>
          <span className="block truncate text-caption text-muted-foreground">{line}</span>
        </span>
        {total !== null && (
          <span className="text-h4 font-display font-extrabold tabular-nums">
            {formatIDR(total)}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-ink-2 transition-transform duration-200 ease-out-soft group-open:rotate-180"
        />
        <span className="sr-only">{text.label}</span>
      </summary>
      <div className="mx-auto max-w-300 space-y-4 px-5 pb-5 md:px-10">
        <SummaryRows draft={draft} legs={legs} />
        <EstimateRow preview={preview} isFinal={props.isFinal} />
        <TrustNote />
      </div>
    </details>
  );
}
