'use client';

import { Plus } from 'lucide-react';

import { BAR_FILL, STATUS_DOT } from '@/components/admin/calendar/quota-colors';
import { SESSION_STATUS } from '@/config/status';
import { sessionsCopy } from '@/lib/copy/sessions';
import { cn } from '@/lib/utils/cn';
import { formatDateLong, formatSessionClock, formatWeekdayShort } from '@/lib/utils/dates';
import { fillRatio, groupByDate, occupancyOf, weekDays } from '@/lib/utils/sessions';
import type { VisitSessionAdmin } from '@/types/session';

const text = sessionsCopy;
const PERCENT = 100;
const DAY_OF_MONTH_START = 8;

export interface WeekCalendarProps {
  // The week's Sunday, `YYYY-MM-DD`.
  weekStart: string;
  sessions: readonly VisitSessionAdmin[];
  today: string;
  onSelectDay: (date: string) => void;
}

// The quota bar and the seats, or the status of a session no one can book.
function SeatsRow({ session, isOpen }: { session: VisitSessionAdmin; isOpen: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            'block h-full rounded-full',
            isOpen ? BAR_FILL[occupancyOf(session.reservedPax, session.capacity)] : 'bg-neutral',
          )}
          style={{
            width: `${String(fillRatio(session.reservedPax, session.capacity) * PERCENT)}%`,
          }}
        />
      </span>
      <span className="text-caption text-muted-foreground tabular-nums">
        {isOpen
          ? text.seats(session.reservedPax, session.capacity)
          : SESSION_STATUS[session.status].label}
      </span>
    </span>
  );
}

function SessionCard({ session, onOpen }: { session: VisitSessionAdmin; onOpen: () => void }) {
  const isOpen = session.status === 'open';
  const time = `${formatSessionClock(session.startTime)}–${formatSessionClock(session.endTime)}`;
  const summary = text.sessionSummary(
    session.label,
    session.reservedPax,
    session.capacity,
    SESSION_STATUS[session.status].label,
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${time}, ${summary}`}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
        !isOpen && 'opacity-60',
      )}
    >
      <span className="flex items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
        <span aria-hidden className={cn('size-1.5 rounded-full', STATUS_DOT[session.status])} />
        {time}
      </span>
      <span className="text-body-sm font-semibold break-words text-foreground">
        {session.label}
      </span>
      <SeatsRow session={session} isOpen={isOpen} />
    </button>
  );
}

function DayHeading({ date, isToday }: { date: string; isToday: boolean }) {
  return (
    <h3
      className={cn(
        'flex items-baseline gap-1.5 text-micro font-semibold text-muted-foreground uppercase',
        isToday && 'text-primary-ink',
      )}
    >
      {formatWeekdayShort(date)}
      <span
        className={cn(
          'text-body-sm text-foreground tabular-nums',
          isToday &&
            'inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground',
        )}
      >
        {Number(date.slice(DAY_OF_MONTH_START))}
      </span>
    </h3>
  );
}

interface DayColumnProps {
  date: string;
  sessions: readonly VisitSessionAdmin[];
  isToday: boolean;
  onSelect: () => void;
}

// One day: its sessions as cards, then a quiet way to add one; both open the day's editor.
function DayColumn({ date, sessions, isToday, onSelect }: DayColumnProps) {
  return (
    <section
      aria-label={formatDateLong(date)}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2',
        isToday && 'border-primary',
      )}
    >
      <DayHeading date={date} isToday={isToday} />
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} onOpen={onSelect} />
      ))}
      <button
        type="button"
        onClick={onSelect}
        aria-label={text.addOnDayLabel(formatDateLong(date))}
        className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-dashed border-border text-caption text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
      >
        <Plus aria-hidden className="size-3.5" />
        {text.addOnDay}
      </button>
    </section>
  );
}

const LEGEND = [
  { key: 'open', className: BAR_FILL.open, label: text.legend.open },
  { key: 'nearly_full', className: BAR_FILL.nearly_full, label: text.legend.nearlyFull },
  { key: 'full', className: BAR_FILL.full, label: text.legend.full },
  { key: 'closed', className: 'bg-neutral', label: text.legend.closed },
] as const;

export function QuotaLegend() {
  return (
    <ul
      aria-label={text.legend.label}
      className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground"
    >
      {LEGEND.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('h-1.5 w-4 rounded-full', item.className)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

// The week view of /dashboard/sessions (Dasbor Gelap): seven day columns on a wide screen, fewer as it narrows, one on a
// phone; every session a card with its time, name, quota bar and seats. Nothing animates.
export function WeekCalendar({ weekStart, sessions, today, onSelectDay }: WeekCalendarProps) {
  const byDate = groupByDate(sessions);
  return (
    <div
      role="group"
      aria-label={text.calendarLabel}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
    >
      {weekDays(weekStart).map((date) => (
        <DayColumn
          key={date}
          date={date}
          sessions={byDate.get(date) ?? []}
          isToday={date === today}
          onSelect={() => {
            onSelectDay(date);
          }}
        />
      ))}
    </div>
  );
}
