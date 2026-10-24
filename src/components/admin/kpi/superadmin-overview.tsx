import { BadgeCheck, Banknote, Star, Users } from 'lucide-react';

import { ChartCard } from '@/components/admin/charts/chart-card';
import { CheckInsCard } from '@/components/admin/charts/checkins-card';
import { LazyRevenueArea, LazySparkline } from '@/components/admin/charts/lazy-charts';
import { KpiCard, KpiUnavailable } from '@/components/admin/kpi/kpi-card';
import { SecurityStrip } from '@/components/admin/kpi/security-strip';
import { CountUp } from '@/components/marketing/count-up';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { hasAnyValue, sumOf, type DailyValue } from '@/lib/utils/kpi';
import { formatRating } from '@/lib/utils/ratings';
import type {
  MonthlyFigure,
  SuperadminOverview as Overview,
  RatingFigure,
} from '@/types/dashboard-stats';

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
      icon={Banknote}
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
      icon={Users}
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
      icon={Star}
      value={figure}
      hint={rating ? text.superadmin.ratingHint(rating.count) : text.unavailableHint}
    />
  );
}

function KpiGrid({ overview }: { overview: Overview }) {
  return (
    <section
      aria-label={text.kpiLabel}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <RevenueCard revenue={overview.revenue} />
      <KpiCard
        label={text.superadmin.paidBookings}
        icon={BadgeCheck}
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
    </section>
  );
}

function RevenueChart({ series }: { series: DailyValue[] | null }) {
  const chart = text.revenueChart;
  return (
    <ChartCard
      title={chart.title}
      description={chart.description}
      hasData={series !== null && hasAnyValue(series)}
      empty={
        series === null
          ? text.chartUnavailable
          : { title: chart.empty, description: chart.emptyDescription }
      }
    >
      {series ? (
        <LazyRevenueArea
          series={series}
          seriesName={chart.series}
          summary={text.chartSummary(chart.title, formatIDR(sumOf(series, (point) => point.value)))}
        />
      ) : null}
    </ChartCard>
  );
}

// Task P4.2.03: the superadmin's overview, for every RW or the one of their RwSwitcher.
export function SuperadminOverview({ overview }: { overview: Overview }) {
  return (
    <div className="flex flex-col gap-6">
      <KpiGrid overview={overview} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RevenueChart series={overview.revenue?.series ?? null} />
        <CheckInsCard series={overview.checkedInVisitors?.series ?? null} />
      </div>
      <SecurityStrip openAlerts={overview.openAlerts} piiRevealsToday={overview.piiRevealsToday} />
    </div>
  );
}
