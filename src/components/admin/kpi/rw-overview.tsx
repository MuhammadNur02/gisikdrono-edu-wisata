import { CalendarCheck, CalendarClock, DoorOpen, Gauge } from 'lucide-react';
import Link from 'next/link';

import { CheckInsCard } from '@/components/admin/charts/checkins-card';
import { KpiCard, KpiUnavailable } from '@/components/admin/kpi/kpi-card';
import { LiveCheckIns } from '@/components/admin/kpi/live-check-ins';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { CountUp } from '@/components/marketing/count-up';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SESSIONS_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { formatTimeRange } from '@/lib/utils/dates';
import { quotaUsagePercent } from '@/lib/utils/kpi';
import type { ActionResult } from '@/types/action-result';
import type { RwOverview as Overview, TodaySession } from '@/types/dashboard-stats';

const text = copy.dashboard.overview;
const EMPTY_FIGURE = '—';

export interface RwOverviewProps {
  overview: Overview;
  readCheckIns: () => Promise<ActionResult<number | null>>;
}

function QuotaCard({ quota }: { quota: Overview['quota'] }) {
  const figure =
    quota === null ? (
      <KpiUnavailable />
    ) : quota.percent === null ? (
      EMPTY_FIGURE
    ) : (
      `${String(quota.percent)} %`
    );
  return (
    <KpiCard
      label={text.rw.quota}
      icon={Gauge}
      value={figure}
      hint={quota ? text.rw.quotaHint(quota.reservedPax, quota.capacity) : text.unavailableHint}
    />
  );
}

function KpiGrid({ overview, readCheckIns }: RwOverviewProps) {
  return (
    <section
      aria-label={text.kpiLabel}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <QuotaCard quota={overview.quota} />
      <KpiCard
        label={text.rw.upcoming}
        icon={CalendarCheck}
        value={
          overview.upcomingBookings === null ? (
            <KpiUnavailable />
          ) : (
            <CountUp value={overview.upcomingBookings} onMount />
          )
        }
        hint={overview.upcomingBookings === null ? text.unavailableHint : text.rw.upcomingHint}
      />
      <KpiCard
        label={text.rw.checkInsToday}
        icon={DoorOpen}
        value={<LiveCheckIns initial={overview.checkInsToday} read={readCheckIns} />}
        hint={text.rw.checkInsTodayHint}
      />
    </section>
  );
}

function SessionRow({ session }: { session: TodaySession }) {
  const percent = quotaUsagePercent(session.reservedPax, session.capacity) ?? 0;
  const seats = text.sessions.seats(session.reservedPax, session.capacity);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-body-sm font-medium tabular-nums">
          {formatTimeRange(session.startTime, session.endTime)}
        </span>
        {session.label ? <span className="text-body-sm">{session.label}</span> : null}
        <StatusBadge kind="session_status" value={session.status} className="ms-auto" />
      </div>
      <Progress value={percent} aria-label={seats} />
      <p className="text-caption text-muted-foreground tabular-nums">
        {`${seats} · ${text.sessions.checkedIn(session.checkedInPax)}`}
      </p>
    </li>
  );
}

function SessionList({ sessions }: { sessions: TodaySession[] | null }) {
  if (sessions === null) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={text.unavailable}
        description={text.unavailableHint}
      />
    );
  }
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title={text.sessions.none}
        description={text.sessions.noneDescription}
      />
    );
  }
  return (
    <ul className="flex flex-col divide-y">
      {sessions.map((session) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </ul>
  );
}

function TodaySessions({ sessions }: { sessions: TodaySession[] | null }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-h4">{text.sessions.title}</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href={SESSIONS_PATH}>{text.sessions.manage}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <SessionList sessions={sessions} />
      </CardContent>
    </Card>
  );
}

// Task P4.2.03: an RW officer's overview, always their own RW (the service is given ctx.rwId, never a URL value).
export function RwOverview({ overview, readCheckIns }: RwOverviewProps) {
  return (
    <div className="flex flex-col gap-6">
      <KpiGrid overview={overview} readCheckIns={readCheckIns} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TodaySessions sessions={overview.todaySessions} />
        <CheckInsCard series={overview.checkIns} />
      </div>
    </div>
  );
}
