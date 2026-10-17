'use client';

import type * as React from 'react';

import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatTimeRange } from '@/lib/utils/dates';
import type { SessionOption } from '@/types/forms';

const FULL_PERCENT = 100;

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

function SessionCard({ session, pax }: { session: SessionOption; pax: number }) {
  const isUnavailable = session.remaining < pax || session.remaining === 0;
  const reservedPercent =
    session.capacity > 0
      ? ((session.capacity - session.remaining) / session.capacity) * FULL_PERCENT
      : FULL_PERCENT;
  const itemId = `session-${session.id}`;

  return (
    <label
      htmlFor={itemId}
      className={cn(
        'flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary',
        isUnavailable && 'cursor-not-allowed opacity-60',
      )}
    >
      <RadioGroupItem
        id={itemId}
        value={session.id}
        disabled={isUnavailable}
        aria-disabled={isUnavailable}
        className="mt-0.5"
      />
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-body-sm font-medium tabular-nums">
          {formatTimeRange(session.startTime, session.endTime)}
        </span>
        {session.label && (
          <span className="text-caption text-muted-foreground">{session.label}</span>
        )}
        <span className="text-caption text-muted-foreground tabular-nums">
          {seatsLabel(session, pax)}
        </span>
        <Progress value={reservedPercent} aria-hidden className="mt-1" />
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
