import { CalendarCheck, CalendarClock, DoorOpen, Gauge, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

import { ChartCard } from '@/components/admin/charts/chart-card';
import { LazyCheckinsBar } from '@/components/admin/charts/lazy-charts';
import { KpiCard } from '@/components/admin/kpi/kpi-card';
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
import { hasAnyValue, quotaUsagePercent, sumOf } from '@/lib/utils/kpi';
import type { ActionResult } from '@/types/action-result';
import type { RwOverview as Overview, TodaySession } from '@/types/dashboard-stats';

const text = copy.dashboard.overview;
const EMPTY_FIGURE = '—';
const numberFormat = new Intl.NumberFormat('id-ID');

export interface RwOverviewProps {
  overview: Overview;
  readCheckIns: () => Promise<ActionResult<number>>;
}

function KpiGrid({ overview, readCheckIns }: RwOverviewProps) {
  const { quota } = overview;
  return (
    <section
      aria-label={text.kpiLabel}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiCard
        label={text.rw.quota}
        icon={Gauge}
        value={quota.percent === null ? EMPTY_FIGURE : `${String(quota.percent)} %`}
        hint={text.rw.quotaHint(quota.reservedPax, quota.capacity)}
      />
      <KpiCard
        label={text.rw.upcoming}
        icon={CalendarCheck}
        value={<CountUp value={overview.upcomingBookings} onMount />}
        hint={text.rw.upcomingHint}
      />
      <KpiCard
        label={text.rw.checkInsToday}
        icon={DoorOpen}
        value={<LiveCheckIns initial={overview.checkInsToday} read={readCheckIns} />}
        hint={text.rw.checkInsTodayHint}
      />
      <KpiCard
        label={text.rw.productsSold}
        icon={ShoppingBag}
        value={EMPTY_FIGURE}
        hint={text.rw.productsSoldHint}
      />
    </section>
  );
}

function SessionRow({ session }: { session: TodaySession }) {
  const percent = quotaUsagePercent(session.reservedPax, session.capacity) ?? 0;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-body-sm font-medium tabular-nums">
          {formatTimeRange(session.startTime, session.endTime)}
        </span>
        {session.label ? <span className="text-body-sm">{session.label}</span> : null}
        <StatusBadge kind="session_status" value={session.status} className="ms-auto" />
      </div>
      <Progress
        value={percent}
        aria-label={text.sessions.seats(session.reservedPax, session.capacity)}
      />
      <p className="text-caption text-muted-foreground tabular-nums">
        {`${text.sessions.seats(session.reservedPax, session.capacity)} · ${text.sessions.checkedIn(session.checkedInPax)}`}
      </p>
    </li>
  );
}

function TodaySessions({ sessions }: { sessions: TodaySession[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-h4">{text.sessions.title}</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href={SESSIONS_PATH}>{text.sessions.manage}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={text.sessions.none}
            description={text.sessions.noneDescription}
          />
        ) : (
          <ul className="flex flex-col divide-y">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Task P4.2.03: an RW officer's overview, always their own RW (the service is given ctx.rwId, never a URL value).
export function RwOverview({ overview, readCheckIns }: RwOverviewProps) {
  const checkInTotal = numberFormat.format(sumOf(overview.checkIns, (point) => point.value));
  return (
    <div className="flex flex-col gap-6">
      <KpiGrid overview={overview} readCheckIns={readCheckIns} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TodaySessions sessions={overview.todaySessions} />
        <ChartCard
          title={text.checkinsChart.title}
          description={text.checkinsChart.description}
          hasData={hasAnyValue(overview.checkIns)}
          empty={{
            title: text.checkinsChart.empty,
            description: text.checkinsChart.emptyDescription,
          }}
        >
          <LazyCheckinsBar
            series={overview.checkIns}
            seriesName={text.checkinsChart.series}
            summary={text.chartSummary(text.checkinsChart.title, checkInTotal)}
          />
        </ChartCard>
      </div>
    </div>
  );
}
