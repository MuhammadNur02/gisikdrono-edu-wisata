import { CalendarX } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

import { OverviewPanel } from '@/components/admin/overview/overview-panel';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { Progress } from '@/components/ui/progress';
import { ATTENDANCE_PATH } from '@/config/attendance';
import { rwAccentClasses } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatSessionClock } from '@/lib/utils/dates';
import { quotaUsagePercent, sumOf } from '@/lib/utils/kpi';
import type { TodaySession } from '@/types/dashboard-stats';
import type { RwBadge } from '@/types/rw-unit';

const text = copy.dashboard.overview;
// 'HH:MM' of a Postgres time ('08:00:00'), compared with the clock as text.
const CLOCK_LENGTH = 'HH:MM'.length;

// The Semarang clock when the page was rendered: 'HH:MM' as a session time is written, and as it reads ('14.20').
export interface TodayClock {
  time: string;
  label: string;
}

export interface TodayPanelProps {
  sessions: TodaySession[] | null;
  rws: readonly RwBadge[];
  clock: TodayClock;
}

function summaryOf(sessions: readonly TodaySession[]): string {
  return text.today.summary(
    sessions.length,
    new Set(sessions.map((session) => session.rwId)).size,
    sumOf(sessions, (session) => session.reservedPax),
    sumOf(sessions, (session) => session.capacity),
    sumOf(sessions, (session) => session.checkedInPax),
  );
}

function SessionRow({ session, rw }: { session: TodaySession; rw: RwBadge | undefined }) {
  const seats = text.sessions.seats(session.reservedPax, session.capacity);
  return (
    <li className="flex items-center gap-3 px-4 py-3 md:px-5">
      <span className="flex w-12 shrink-0 flex-col tabular-nums">
        <span className="text-caption font-semibold text-foreground">
          {formatSessionClock(session.startTime)}
        </span>
        <span className="text-caption text-muted-foreground">
          {formatSessionClock(session.endTime)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2 text-caption">
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              rwAccentClasses(rw?.accentKey ?? null).fill,
            )}
          />
          <span className="font-semibold text-foreground">{rw?.label}</span>
          <span className="truncate text-muted-foreground">{session.label}</span>
        </span>
        <Progress
          value={quotaUsagePercent(session.reservedPax, session.capacity) ?? 0}
          aria-label={seats}
        />
        <span className="text-caption text-muted-foreground tabular-nums">
          {`${seats} · ${text.sessions.checkedIn(session.checkedInPax)}`}
        </span>
      </span>
    </li>
  );
}

function NowMarker({ label }: { label: string }) {
  return (
    <li aria-hidden className="flex items-center gap-2 px-4 md:px-5">
      <span className="text-micro font-semibold text-primary-ink">{label}</span>
      <span className="h-px flex-1 bg-primary" />
    </li>
  );
}

function SessionList({ sessions, rws, clock }: TodayPanelProps & { sessions: TodaySession[] }) {
  // The marker sits before the first session that has not started yet.
  const nextIndex = sessions.findIndex(
    (session) => session.startTime.slice(0, CLOCK_LENGTH) > clock.time,
  );
  return (
    <ol className="flex flex-col divide-y divide-border">
      {sessions.map((session, index) => (
        <Fragment key={session.id}>
          {index === nextIndex ? <NowMarker label={text.today.now(clock.label)} /> : null}
          <SessionRow session={session} rw={rws.find((rw) => rw.id === session.rwId)} />
        </Fragment>
      ))}
    </ol>
  );
}

// "Kunjungan hari ini" (Dasbor Gelap): every session of the day in time order, with its seats and who came, and a
// line where the day stands now. RLS leaves an RW officer their own RW's sessions.
export function TodayPanel(props: TodayPanelProps) {
  const { sessions } = props;
  return (
    <OverviewPanel
      title={text.today.title}
      description={sessions && sessions.length > 0 ? summaryOf(sessions) : undefined}
      action={<Link href={ATTENDANCE_PATH}>{text.today.openAttendance}</Link>}
    >
      {sessions === null ? (
        <EmptyState icon={CalendarX} {...text.chartUnavailable} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={text.sessions.none}
          description={text.sessions.noneDescription}
        />
      ) : (
        <SessionList {...props} sessions={sessions} />
      )}
    </OverviewPanel>
  );
}
