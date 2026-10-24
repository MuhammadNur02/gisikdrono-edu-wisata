'use client';

import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { OVERRIDE_REASON_MAX_LENGTH } from '@/config/scanner';
import { scannerCopy } from '@/lib/copy/scanner';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import { attendeeBoundsOf, unpaidAttendeesOf } from '@/lib/validations/scanner';
import type { ScanTicketCard } from '@/types/scanner';

const text = scannerCopy;
const NOT_DIGITS = /\D/g;

// FR-SCAN-03: the group card of a preview, so the officer can match the PIC and the group. First name only.
export function TicketCard({ ticket }: { ticket: ScanTicketCard }) {
  const rows: [string, string][] = [
    [text.card.institution, ticket.institutionName ?? text.card.individual],
    [text.card.pic, ticket.picFirstName],
    [text.card.package, ticket.packageName],
    [
      text.card.session,
      `${formatDateLong(ticket.visitDate)}, ${formatTimeRange(ticket.sessionStart, ticket.sessionEnd)}`,
    ],
    [text.card.pax, String(ticket.paxCount)],
    [text.card.participants, String(ticket.participantCount)],
  ];
  if (ticket.addons.length > 0) {
    const addons = ticket.addons.map((addon) => `${addon.name} × ${String(addon.quantity)}`);
    rows.push([text.card.addons, addons.join(', ')]);
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface AttendeeStepperProps {
  paxCount: number;
  value: number;
  onChange: (value: number) => void;
}

// What the officer is typing, so the field may be empty for a moment while the count itself stays within bounds.
function useAttendeeDraft({ paxCount, value, onChange }: AttendeeStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const bounds = attendeeBoundsOf(paxCount);
  const clamp = (next: number) => Math.min(bounds.max, Math.max(bounds.min, next));
  return {
    bounds,
    shown: draft ?? String(value),
    type: (typed: string) => {
      const digits = typed.replace(NOT_DIGITS, '');
      setDraft(digits);
      if (digits !== '') onChange(clamp(Number(digits)));
    },
    step: (next: number) => {
      setDraft(null);
      onChange(clamp(next));
    },
    settle: () => {
      setDraft(null);
    },
  };
}

type AttendeeDraft = ReturnType<typeof useAttendeeDraft>;

// One step down or up, a 44 px target that stops at the bounds.
function StepButton({
  direction,
  value,
  draft,
}: {
  direction: -1 | 1;
  value: number;
  draft: AttendeeDraft;
}) {
  const isDown = direction < 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11"
      aria-label={isDown ? text.decrease : text.increase}
      disabled={isDown ? value <= draft.bounds.min : value >= draft.bounds.max}
      onClick={() => {
        draft.step(value + direction);
      }}
    >
      {isDown ? <Minus aria-hidden /> : <Plus aria-hidden />}
    </Button>
  );
}

// docs/StyleGuide.md §6.6 AttendeeStepper: the booked count by default, up to twice it, typed on the numeric keypad
// or stepped with 44 px buttons; the people above the booking are announced as unpaid.
function AttendeeStepper(props: AttendeeStepperProps) {
  const { paxCount, value } = props;
  const id = useId();
  const draft = useAttendeeDraft(props);
  const unpaid = unpaidAttendeesOf(value, paxCount);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{text.attendees}</Label>
      <div className="flex items-center gap-2">
        <StepButton direction={-1} value={value} draft={draft} />
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={`${id}-hint`}
          className="h-11 w-24 text-center text-h4 tabular-nums"
          value={draft.shown}
          onChange={(event) => {
            draft.type(event.target.value);
          }}
          onBlur={draft.settle}
        />
        <StepButton direction={1} value={value} draft={draft} />
      </div>
      <p id={`${id}-hint`} aria-live="polite" className="text-caption text-muted-foreground">
        {unpaid > 0 ? text.unpaid(unpaid) : text.attendeesHint(draft.bounds.max)}
      </p>
    </div>
  );
}

function OverrideReasonField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{text.overrideReason}</Label>
      <Textarea
        id={id}
        required
        aria-describedby={`${id}-hint`}
        maxLength={OVERRIDE_REASON_MAX_LENGTH}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <p id={`${id}-hint`} className="text-caption text-muted-foreground">
        {text.overrideHint}
      </p>
    </div>
  );
}

export interface CommitFormProps {
  paxCount: number;
  // A superadmin's override of a wrong day or a closed window asks for a reason (FR-SCAN-09).
  needsReason: boolean;
  isBusy: boolean;
  onCommit: (attendeeCount: number, overrideReason?: string) => void;
}

// The officer has checked the PIC; the count they confirm goes with the commit (FR-SCAN-04).
export function CommitForm({ paxCount, needsReason, isBusy, onCommit }: CommitFormProps) {
  const [attendees, setAttendees] = useState(paxCount);
  const [reason, setReason] = useState('');
  const isMissingReason = needsReason && reason.trim() === '';
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (isMissingReason) return;
        onCommit(attendees, needsReason ? reason.trim() : undefined);
      }}
    >
      <AttendeeStepper paxCount={paxCount} value={attendees} onChange={setAttendees} />
      {needsReason ? <OverrideReasonField value={reason} onChange={setReason} /> : null}
      <Button
        type="submit"
        size="lg"
        variant={needsReason ? 'default' : 'success'}
        className="w-full"
        loading={isBusy}
        disabled={isMissingReason}
      >
        {needsReason ? text.override : text.confirm}
      </Button>
    </form>
  );
}
