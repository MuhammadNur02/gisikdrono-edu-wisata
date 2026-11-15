import { LazySparkline } from '@/components/admin/charts/lazy-charts';
import { KpiCard, KpiLedger, KpiUnavailable } from '@/components/admin/kpi/kpi-card';
import { ActionPanel } from '@/components/admin/overview/action-panel';
import { CumulativeRevenuePanel } from '@/components/admin/overview/cumulative-revenue-panel';
import { OccupancyPanel } from '@/components/admin/overview/occupancy-panel';
import { TodayPanel, type TodayClock } from '@/components/admin/overview/today-panel';
import { CountUp } from '@/components/marketing/count-up';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { hasAnyValue, type DailyValue } from '@/lib/utils/kpi';
import { formatRating } from '@/lib/utils/ratings';
import type {
  MonthlyFigure,
  OverviewToday,
  SuperadminOverview as Overview,
  RatingFigure,
} from '@/types/dashboard-stats';
import type { RwBadge } from '@/types/rw-unit';

const text = copy.dashboard.overview;
const EMPTY_FIGURE = '—';
const RUPIAH_PREFIX = 'Rp ';

// The amount counts up as digits; a screen reader hears the whole rupiah amount once.
function RupiahFigure({ amount }: { amount: number }) {
  return (
    <>
      <span className="sr-only">{formatIDR(amount)}</span>
      <span aria-hidden>
        {RUPIAH_PREFIX}
        <CountUp value={amount} onMount />
      </span>
    </>
  );
}

// No sparkline over 30 empty days: a flat line would read as data.
function sparklineOf(series: DailyValue[]) {
  return hasAnyValue(series) ? <LazySparkline series={series} /> : null;
}

function RevenueCard({ revenue }: { revenue: MonthlyFigure | null }) {
  return (
    <KpiCard
      label={text.superadmin.revenue}
      value={revenue ? <RupiahFigure amount={revenue.value} /> : <KpiUnavailable />}
      hint={revenue ? text.superadmin.revenueHint : text.unavailableHint}
      trend={revenue?.trend}
      chart={revenue ? sparklineOf(revenue.series) : null}
    />
  );
}

function CheckedInCard({ figure }: { figure: MonthlyFigure | null }) {
  return (
    <KpiCard
      label={text.superadmin.checkedIn}
      value={figure ? <CountUp value={figure.value} onMount /> : <KpiUnavailable />}
      hint={figure ? text.superadmin.checkedInHint : text.unavailableHint}
      trend={figure?.trend}
      chart={figure ? sparklineOf(figure.series) : null}
    />
  );
}

function RatingCard({ rating }: { rating: RatingFigure | null }) {
  const figure =
    rating === null ? (
      <KpiUnavailable />
    ) : rating.average === null ? (
      EMPTY_FIGURE
    ) : (
      formatRating(rating.average)
    );
  return (
    <KpiCard
      label={text.superadmin.rating}
      value={figure}
      hint={rating ? text.superadmin.ratingHint(rating.count) : text.unavailableHint}
    />
  );
}

function KpiGrid({ overview }: { overview: Overview }) {
  return (
    <KpiLedger label={text.kpiLabel} columns="four">
      <RevenueCard revenue={overview.revenue} />
      <KpiCard
        label={text.superadmin.paidBookings}
        value={
          overview.paidBookings ? (
            <CountUp value={overview.paidBookings.value} onMount />
          ) : (
            <KpiUnavailable />
          )
        }
        hint={overview.paidBookings ? text.superadmin.paidBookingsHint : text.unavailableHint}
        trend={overview.paidBookings?.trend}
      />
      <CheckedInCard figure={overview.checkedInVisitors} />
      <RatingCard rating={overview.rating} />
    </KpiLedger>
  );
}

export interface SuperadminOverviewProps {
  overview: Overview;
  today: OverviewToday;
  rws: readonly RwBadge[];
  clock: TodayClock;
}

// Task P4.2.03, Dasbor Gelap: the superadmin's overview, for every RW or the one of their RwSwitcher. The ledger of the
// month, today and what waits, then the money and the week ahead.
export function SuperadminOverview({ overview, today, rws, clock }: SuperadminOverviewProps) {
  return (
    <div className="flex flex-col gap-5">
      <KpiGrid overview={overview} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodayPanel sessions={today.sessions} rws={rws} clock={clock} />
        </div>
        <ActionPanel actions={today.actions} piiRevealsToday={overview.piiRevealsToday} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CumulativeRevenuePanel series={overview.revenue?.series ?? null} />
        </div>
        <OccupancyPanel rows={today.occupancy} rws={rws} />
      </div>
    </div>
  );
}
