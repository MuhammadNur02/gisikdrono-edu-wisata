'use client';

import { CALENDAR_BARS_PER_DAY } from '@/config/sessions';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatDateLong } from '@/lib/utils/dates';
import { calendarWeeks, fillRatio, groupByDate, occupancyOf } from '@/lib/utils/sessions';
import type { VisitSessionAdmin } from '@/types/session';

const text = copy.sessions;
const PERCENT = 100;
const DAY_OF_MONTH_START = 8;

export interface SessionCalendarProps {
  // `YYYY-MM`.
  month: string;
  sessions: readonly VisitSessionAdmin[];
  // Today's visit date in Semarang, for the highlight.
  today: string;
  onSelectDay: (date: string) => void;
}

const BAR_FILL = {
  open: 'bg-chart-1',
  nearly_full: 'bg-warning',
  full: 'bg-danger',
} as const;

const STATUS_DOT = {
  open: 'bg-success',
  closed: 'bg-neutral',
  cancelled: 'bg-danger',
} as const;

// docs/StyleGuide.md §6.8: a thin quota bar (reserved / capacity) with the session's status dot. Nothing animates.
function QuotaBar({ session }: { session: VisitSessionAdmin }) {
  const ratio = fillRatio(session.reservedPax, session.capacity);
  const fill = BAR_FILL[occupancyOf(session.reservedPax, session.capacity)];
  return (
    <div className="flex items-center gap-1" title={session.label}>
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[session.status])}
      />
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', fill)}
          style={{ width: `${String(ratio * PERCENT)}%` }}
        />
      </div>
    </div>
  );
}

function DaySummary({ sessions }: { sessions: readonly VisitSessionAdmin[] }) {
  return (
    <span className="flex flex-1 flex-col justify-end gap-1">
      {sessions.slice(0, CALENDAR_BARS_PER_DAY).map((session) => (
        <QuotaBar key={session.id} session={session} />
      ))}
      {sessions.length > 0 ? (
        <span className="text-caption text-muted-foreground tabular-nums">
          {text.sessionCount(sessions.length)}
        </span>
      ) : null}
    </span>
  );
}

interface DayCellProps {
  date: string;
  sessions: readonly VisitSessionAdmin[];
  isToday: boolean;
  onSelect: () => void;
}

// A day is a button that opens the editor; today wears the primary ring.
function DayCell({ date, sessions, isToday, onSelect }: DayCellProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={text.openDay(formatDateLong(date))}
      className={cn(
        'flex min-h-20 flex-col gap-1 rounded-lg border border-border bg-card p-2 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring md:min-h-24',
        isToday && 'border-primary',
      )}
    >
      <span
        className={cn(
          'text-body-sm font-medium tabular-nums',
          isToday &&
            'inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground',
        )}
      >
        {date.slice(DAY_OF_MONTH_START)}
      </span>
      <DaySummary sessions={sessions} />
    </button>
  );
}

export function SessionCalendar({ month, sessions, today, onSelectDay }: SessionCalendarProps) {
  const byDate = groupByDate(sessions);
  return (
    <div role="group" aria-label={text.calendarLabel} className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-overline text-muted-foreground">
        {text.weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      {calendarWeeks(month).map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7 gap-1">
          {week.map((date, dayIndex) =>
            date === null ? (
              <span key={dayIndex} aria-hidden />
            ) : (
              <DayCell
                key={date}
                date={date}
                sessions={byDate.get(date) ?? []}
                isToday={date === today}
                onSelect={() => {
                  onSelectDay(date);
                }}
              />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
