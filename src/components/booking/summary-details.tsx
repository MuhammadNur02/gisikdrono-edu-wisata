'use client';

import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { BookingStep } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { sessionsOn, type BookingDraft } from '@/lib/utils/booking-wizard';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { BookableLeg } from '@/types/session';

const text = copy.booking.wizard;
const summary = text.summary;

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
    <div className="flex justify-between gap-4 text-body md:grid md:grid-cols-[11.25rem_minmax(0,1fr)]">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words text-foreground md:text-left">{children}</dd>
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
export function SummaryDetails(props: {
  draft: BookingDraft;
  legs: readonly BookableLeg[];
  onOpen: (step: BookingStep) => void;
}) {
  const { draft, legs, onOpen } = props;
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card p-5 md:p-7">
      <DetailBlock title={summary.visit} step="jadwal" onOpen={onOpen}>
        <DetailRow label={summary.visitDate}>
          {draft.visitDate ? formatDateLong(draft.visitDate) : ''}
        </DetailRow>
        {legs.map((leg, index) => (
          <DetailRow
            key={leg.rw.id}
            label={legs.length > 1 ? `${text.aside.session} ${leg.rw.label}` : text.aside.session}
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
    </div>
  );
}
