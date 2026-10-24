'use client';

import { format, parseISO } from 'date-fns';
import { id as indonesian } from 'date-fns/locale';

import { RwTag } from '@/components/layout/rw-tag';
import { availabilityCopy as text } from '@/lib/copy/catalogue-ui';
import {
  seatTone,
  type AvailabilityDay,
  type AvailabilitySession,
  type SeatTone,
} from '@/lib/utils/availability';
import { cn } from '@/lib/utils/cn';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { RwBadge } from '@/types/rw-unit';

export type SessionRow = AvailabilitySession;

// The seats line in its state's colour, so a full day says `Penuh` and never rests on colour alone (§6).
const SEAT_TEXT: Record<SeatTone, string> = {
  open: 'text-success',
  few: 'text-warning',
  full: 'text-danger',
};

// A visit date is a Semarang calendar day ('YYYY-MM-DD'); read as a local date it shows the same day everywhere.
function dayParts(date: string) {
  const day = parseISO(date);
  return {
    weekday: format(day, 'EEE', { locale: indonesian }),
    dayOfMonth: format(day, 'd'),
    month: format(day, 'MMMM yyyy', { locale: indonesian }),
  };
}

interface DayCellProps {
  day: AvailabilityDay;
  isChosen: boolean;
  onChoose: (date: string) => void;
}

// text-micro is a size tailwind-merge does not know, so it stays outside cn() next to a colour.
// Date cell of DESIGN-SPEC §3.5: the weekday in small caps, the day, the seats left. Chosen: the inverse fill. Full:
// the seats line says Penuh and the cell fades to 60 %, still focusable so its sessions can be read.
function DayCell({ day, isChosen, onChoose }: DayCellProps) {
  const parts = dayParts(day.date);
  const tone = seatTone(day.remaining, day.capacity);
  return (
    <button
      type="button"
      aria-pressed={isChosen}
      aria-label={`${formatDateLong(day.date)}, ${tone === 'full' ? text.full : text.seatsShort(day.remaining)}`}
      onClick={() => {
        onChoose(day.date);
      }}
      className={cn(
        'flex h-18 press-scale flex-col items-center justify-center gap-0.5 rounded-md border transition-colors duration-180',
        isChosen
          ? 'border-secondary bg-secondary text-secondary-foreground'
          : 'border-border-strong bg-background hover:bg-muted',
        tone === 'full' && !isChosen && 'opacity-60',
      )}
    >
      <span className="text-micro font-semibold tracking-wider uppercase">{parts.weekday}</span>
      <span className="font-display text-xl leading-tight font-bold tabular-nums">
        {parts.dayOfMonth}
      </span>
      <span
        className={`text-micro ${cn('font-medium', isChosen ? 'text-secondary-foreground' : SEAT_TEXT[tone])}`}
      >
        {tone === 'full' ? text.full : text.seatsShort(day.remaining)}
      </span>
    </button>
  );
}

export interface AvailabilityDaysProps {
  days: readonly AvailabilityDay[];
  chosenDate: string;
  onChoose: (date: string) => void;
}

export function AvailabilityDays({ days, chosenDate, onChoose }: AvailabilityDaysProps) {
  const first = days[0];
  return (
    <div className="space-y-2">
      <div role="group" aria-label={text.days} className="grid grid-cols-5 gap-2">
        {days.map((day) => (
          <DayCell
            key={day.date}
            day={day}
            isChosen={day.date === chosenDate}
            onChoose={onChoose}
          />
        ))}
      </div>
      {first ? (
        <p className="text-caption text-muted-foreground capitalize">
          {dayParts(first.date).month}
        </p>
      ) : null}
    </div>
  );
}

function SessionOption({ session, rws }: { session: SessionRow; rws: readonly RwBadge[] }) {
  const tone = seatTone(session.remaining, session.capacity);
  return (
    <li
      className={cn(
        'space-y-1 rounded-lg border border-border-strong bg-card px-4 py-3.5',
        tone === 'full' && 'bg-muted opacity-55',
      )}
    >
      <p className="flex flex-wrap items-center gap-2 text-label font-semibold">
        {session.label ?? text.session}
        {rws.length > 1 ? <RwTag rw={rwBadgeFor(session.rwId, rws)} size="sm" /> : null}
      </p>
      <p className="text-body-sm text-ink-2 tabular-nums">
        {formatTimeRange(session.startTime, session.endTime)}
      </p>
      <p className={cn('text-caption font-medium', SEAT_TEXT[tone])}>
        {tone === 'full' ? text.full : text.seatsOf(session.remaining, session.capacity)}
      </p>
    </li>
  );
}

// The sessions of the chosen day (DESIGN-SPEC §3.5 session options), read-only here: the date and the session are
// chosen in the booking wizard, which checks the seats again.
export function SessionOptions({ day, rws }: { day: AvailabilityDay; rws: readonly RwBadge[] }) {
  return (
    <section aria-label={text.sessionsOf(formatDateLong(day.date))} aria-live="polite">
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {day.sessions.map((session) => (
          <SessionOption key={session.id} session={session} rws={rws} />
        ))}
      </ul>
    </section>
  );
}
