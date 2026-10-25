'use client';

import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { BookingStep } from '@/config/site';
import type { QuotePreviewState } from '@/hooks/use-quote-preview';
import { bookingLayoutCopy } from '@/lib/copy/booking-layout';
import { copy } from '@/lib/copy/id';
import { sessionsOn, type BookingDraft } from '@/lib/utils/booking-wizard';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { BookableLeg } from '@/types/session';

const text = copy.booking.wizard;
const summary = { ...text.summary, ...bookingLayoutCopy.wizard.summary };
const aside = bookingLayoutCopy.wizard.aside;

function DetailBlock(props: {
  title: string;
  step: BookingStep;
  onOpen: (step: BookingStep) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5 py-5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-meta-caps text-muted-foreground">{props.title}</h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="-mr-2 px-2"
          onClick={() => {
            props.onOpen(props.step);
          }}
        >
          <Pencil aria-hidden className="size-4" />
          {summary.edit}
          <span className="sr-only"> {props.title}</span>
        </Button>
      </div>
      <dl className="space-y-1.5">{props.children}</dl>
    </div>
  );
}

// One key and its value: a 180 px key column from md (DESIGN-SPEC §3.10 step 4), key over value-right on a phone.
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-body md:justify-start md:gap-0">
      <dt className="shrink-0 text-muted-foreground md:w-45">{label}</dt>
      <dd className="min-w-0 text-right break-words text-foreground md:flex-1 md:text-left">
        {children}
      </dd>
    </div>
  );
}

function sessionTime(leg: BookableLeg, draft: BookingDraft, index: number): string {
  const chosen = draft.visitDate
    ? sessionsOn(leg, draft.visitDate).find((session) => session.id === draft.sessionIds[index])
    : undefined;
  if (!chosen) return '';
  const time = formatTimeRange(chosen.startTime, chosen.endTime);
  return chosen.label ? `${chosen.label} · ${time}` : time;
}

function groupText(draft: BookingDraft): string {
  const type = draft.bookerType ? text.booker.bookerTypes[draft.bookerType] : '';
  return draft.bookerType !== 'individual' && draft.institutionName
    ? `${type} · ${draft.institutionName}`
    : type;
}

// What the booking will say, before it is sent (docs/StyleGuide.md §5.14): the visit and the person in charge, each
// with the step to change it. The add-ons are listed in the cost panel below.
// The add-ons as the server's quote names them, "Pupuk Kompos 1 kg × 2 · Bibit Cabai × 10"; their count until it
// has priced them.
function addonsText(draft: BookingDraft, preview: QuotePreviewState): string {
  if (draft.addons.length === 0) return aside.noAddons;
  if (preview.status !== 'ready' || preview.answer.kind !== 'quote') {
    return aside.addonCount(draft.addons.length);
  }
  return preview.answer.quote.lines
    .flatMap((line) => (line.kind === 'addon' ? [`${line.name} × ${String(line.quantity)}`] : []))
    .join(' · ');
}

export function SummaryDetails(props: {
  draft: BookingDraft;
  legs: readonly BookableLeg[];
  preview: QuotePreviewState;
  onOpen: (step: BookingStep) => void;
}) {
  const { draft, legs, preview, onOpen } = props;
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card p-5 md:p-7">
      <DetailBlock title={summary.visit} step="jadwal" onOpen={onOpen}>
        <DetailRow label={summary.visitDate}>
          {draft.visitDate ? formatDateLong(draft.visitDate) : ''}
        </DetailRow>
        {legs.map((leg, index) => (
          <DetailRow
            key={leg.rw.id}
            label={legs.length > 1 ? `${aside.session} ${leg.rw.label}` : aside.session}
          >
            <span className="tabular-nums">{sessionTime(leg, draft, index)}</span>
          </DetailRow>
        ))}
        <DetailRow label={summary.paxLabel}>{summary.pax(draft.pax)}</DetailRow>
      </DetailBlock>
      <DetailBlock title={summary.contact} step="data" onOpen={onOpen}>
        <DetailRow label={summary.group}>{groupText(draft)}</DetailRow>
        <DetailRow label={summary.picName}>{draft.picName}</DetailRow>
        <DetailRow label={summary.phone}>
          <span className="tabular-nums">{draft.contact?.phone}</span>
        </DetailRow>
        <DetailRow label={summary.email}>
          {draft.contact?.channel === 'email' ? draft.contact.email : draft.picEmail}
        </DetailRow>
      </DetailBlock>
      <DetailBlock title={aside.addons} step="tambahan" onOpen={onOpen}>
        <DetailRow label={summary.products}>{addonsText(draft, preview)}</DetailRow>
      </DetailBlock>
    </div>
  );
}
