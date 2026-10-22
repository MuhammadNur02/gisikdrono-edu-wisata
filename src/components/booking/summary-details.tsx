'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { BookingStep } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { sessionsOn, type BookingDraft } from '@/lib/utils/booking-wizard';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { BookableLeg } from '@/types/session';

const text = copy.booking.wizard;

function DetailBlock(props: {
  title: string;
  step: BookingStep;
  onOpen: (step: BookingStep) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="text-caption font-medium text-muted-foreground">{props.title}</p>
        {props.children}
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() => {
          props.onOpen(props.step);
        }}
      >
        {text.summary.edit}
        <span className="sr-only"> {props.title}</span>
      </Button>
    </div>
  );
}

function sessionTime(leg: BookableLeg, draft: BookingDraft, index: number): string {
  const chosen = draft.visitDate
    ? sessionsOn(leg, draft.visitDate).find((session) => session.id === draft.sessionIds[index])
    : undefined;
  return chosen ? formatTimeRange(chosen.startTime, chosen.endTime) : '';
}

// What the booking will say, before it is sent (docs/StyleGuide.md §5.14): the visit, the group and the contact, each
// with the step to change it.
export function SummaryDetails(props: {
  draft: BookingDraft;
  legs: readonly BookableLeg[];
  onOpen: (step: BookingStep) => void;
}) {
  const { draft, legs, onOpen } = props;
  const booker = text.booker;
  return (
    <div className="divide-y divide-border rounded-xl border border-border px-4">
      <DetailBlock title={text.summary.visit} step="jadwal" onOpen={onOpen}>
        <p className="text-body-sm font-medium">
          {draft.visitDate ? formatDateLong(draft.visitDate) : ''}
        </p>
        {legs.map((leg, index) => (
          <p key={leg.rw.id} className="text-body-sm tabular-nums">
            {leg.rw.label} · {sessionTime(leg, draft, index)}
          </p>
        ))}
      </DetailBlock>
      <DetailBlock title={text.summary.group} step="data" onOpen={onOpen}>
        <p className="text-body-sm font-medium">
          {draft.bookerType ? booker.bookerTypes[draft.bookerType] : ''}
        </p>
        {draft.bookerType !== 'individual' && draft.institutionName && (
          <p className="text-body-sm">{draft.institutionName}</p>
        )}
        <p className="text-body-sm tabular-nums">{text.summary.pax(draft.pax)}</p>
      </DetailBlock>
      <DetailBlock title={text.summary.contact} step="data" onOpen={onOpen}>
        <p className="text-body-sm font-medium">{draft.picName}</p>
        <p className="text-body-sm tabular-nums">{draft.contact?.phone}</p>
        <p className="text-body-sm break-all">
          {draft.contact?.channel === 'email' ? draft.contact.email : draft.picEmail}
        </p>
      </DetailBlock>
    </div>
  );
}
