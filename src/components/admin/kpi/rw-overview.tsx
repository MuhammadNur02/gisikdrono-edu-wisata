import { CheckInsCard } from '@/components/admin/charts/checkins-card';
import { LazySparkline } from '@/components/admin/charts/lazy-charts';
import { KpiCard, KpiLedger, KpiUnavailable } from '@/components/admin/kpi/kpi-card';
import { LiveCheckIns } from '@/components/admin/kpi/live-check-ins';
import { ActionPanel } from '@/components/admin/overview/action-panel';
import { OccupancyPanel } from '@/components/admin/overview/occupancy-panel';
import { TodayPanel, type TodayClock } from '@/components/admin/overview/today-panel';
import { CountUp } from '@/components/marketing/count-up';
import { copy } from '@/lib/copy/id';
import { hasAnyValue, sumOf } from '@/lib/utils/kpi';
import type { ActionResult } from '@/types/action-result';
import type { OverviewToday, RwOverview as Overview } from '@/types/dashboard-stats';
import type { RwBadge } from '@/types/rw-unit';

const text = copy.dashboard.overview;
const EMPTY_FIGURE = '—';

export interface RwOverviewProps {
  overview: Overview;
  today: OverviewToday;
  rws: readonly RwBadge[];
  clock: TodayClock;
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
      value={figure}
      hint={quota ? text.rw.quotaHint(quota.reservedPax, quota.capacity) : text.unavailableHint}
    />
  );
}

// The last 30 days' check-ins in one figure, with their sparkline.
function MonthCheckInsCard({ series }: { series: Overview['checkIns'] }) {
  return (
    <KpiCard
      label={text.checkinsChart.title}
      value={
        series ? <CountUp value={sumOf(series, (day) => day.value)} onMount /> : <KpiUnavailable />
      }
      hint={series ? text.checkinsChart.description : text.unavailableHint}
      chart={series && hasAnyValue(series) ? <LazySparkline series={series} /> : null}
    />
  );
}

function KpiGrid({ overview, readCheckIns }: Pick<RwOverviewProps, 'overview' | 'readCheckIns'>) {
  return (
    <KpiLedger label={text.kpiLabel} columns="four">
      <QuotaCard quota={overview.quota} />
      <KpiCard
        label={text.rw.upcoming}
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
        value={<LiveCheckIns initial={overview.checkInsToday} read={readCheckIns} />}
        hint={text.rw.checkInsTodayHint}
      />
      <MonthCheckInsCard series={overview.checkIns} />
    </KpiLedger>
  );
}

// Task P4.2.03, Dasbor Gelap: an RW officer's overview, always their own RW (the services are given ctx.rwId, never a
// URL value). The same panels as the superadmin's, with the check-ins chart where the money would be.
export function RwOverview({ overview, today, rws, clock, readCheckIns }: RwOverviewProps) {
  return (
    <div className="flex flex-col gap-5">
      <KpiGrid overview={overview} readCheckIns={readCheckIns} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodayPanel sessions={today.sessions} rws={rws} clock={clock} />
        </div>
        <ActionPanel actions={today.actions} piiRevealsToday={null} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CheckInsCard series={overview.checkIns} />
        </div>
        <OccupancyPanel rows={today.occupancy} rws={rws} />
      </div>
    </div>
  );
}
