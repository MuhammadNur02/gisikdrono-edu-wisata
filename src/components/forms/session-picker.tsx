'use client';

import type * as React from 'react';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatTimeRange } from '@/lib/utils/dates';
import type { SessionOption } from '@/types/forms';

// A session with a fifth of its seats or fewer left reads in amber (DESIGN-SPEC §2.4 Session option).
const FEW_SEATS_SHARE = 0.2;

export interface SessionPickerProps extends Omit<
  React.ComponentProps<typeof RadioGroup>,
  'value' | 'onValueChange' | 'onChange'
> {
  sessions: readonly SessionOption[];
  // The group size: a session with fewer seats left than this cannot be chosen.
  pax: number;
  value: string | undefined;
  onChange: (sessionId: string) => void;
}

function seatsLabel(session: SessionOption, pax: number): string {
  if (session.remaining === 0) return copy.forms.session.full;
  const remaining = copy.forms.session.remaining(session.remaining, session.capacity);
  return session.remaining < pax ? `${remaining} · ${copy.forms.session.tooSmall}` : remaining;
}

function seatsTone(session: SessionOption, pax: number): string {
  if (session.remaining < pax || session.remaining === 0) return 'text-destructive';
  return session.remaining <= session.capacity * FEW_SEATS_SHARE ? 'text-warning' : 'text-success';
}

// DESIGN-SPEC §2.4 Session option: the session's name, its time and the seats left, the radio at the top right.
// Chosen: a 2 px brick edge on the brick tint. A session without room for the group is greyed and cannot be chosen.
function SessionCard({ session, pax }: { session: SessionOption; pax: number }) {
  const isUnavailable = session.remaining < pax || session.remaining === 0;
  const time = formatTimeRange(session.startTime, session.endTime);
  const itemId = `session-${session.id}`;

  return (
    <label
      htmlFor={itemId}
      className={cn(
        'relative flex cursor-pointer flex-col gap-1 rounded-xl border border-border-strong bg-card py-4 pr-12 pl-4.5 transition-colors duration-160 ease-out-soft hover:bg-muted/60 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-tint has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary',
        isUnavailable && 'cursor-not-allowed bg-muted opacity-55 hover:bg-muted',
      )}
    >
      <RadioGroupItem
        id={itemId}
        value={session.id}
        disabled={isUnavailable}
        aria-disabled={isUnavailable}
        className="absolute top-4 right-4"
      />
      {session.label && <span className="text-label text-foreground">{session.label}</span>}
      <span
        className={cn(
          'tabular-nums',
          session.label ? 'text-body-sm text-ink-2' : 'text-label text-foreground',
        )}
      >
        {time}
      </span>
      <span className={cn('text-label-sm tabular-nums', seatsTone(session, pax))}>
        {seatsLabel(session, pax)}
      </span>
    </label>
  );
}

// docs/StyleGuide.md §5.6 and docs/PRD.md FR-BOOK-02: radio cards with the seats left in each session.
// The numbers come from v_session_availability through the server; the wizard refreshes them, this only
// shows them. A combo package renders one picker per RW leg.
export function SessionPicker({
  sessions,
  pax,
  value,
  onChange,
  className,
  ...props
}: SessionPickerProps) {
  return (
    <RadioGroup
      value={value ?? ''}
      onValueChange={onChange}
      className={cn('grid gap-3 sm:grid-cols-2', className)}
      {...props}
    >
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} pax={pax} />
      ))}
    </RadioGroup>
  );
}
