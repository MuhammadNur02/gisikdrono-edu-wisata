import { BadgeCheck, Banknote, Star, Users } from 'lucide-react';

import { ChartCard } from '@/components/admin/charts/chart-card';
import {
  LazyCheckinsBar,
  LazyRevenueArea,
  LazySparkline,
} from '@/components/admin/charts/lazy-charts';
import { KpiCard } from '@/components/admin/kpi/kpi-card';
import { SecurityStrip } from '@/components/admin/kpi/security-strip';
import { CountUp } from '@/components/marketing/count-up';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { hasAnyValue, sumOf, type DailyValue } from '@/lib/utils/kpi';
import { formatRating } from '@/lib/utils/ratings';
import type { SuperadminOverview as Overview } from '@/types/dashboard-stats';

const text = copy.dashboard.overview;
const EMPTY_FIGURE = '—';
const numberFormat = new Intl.NumberFormat('id-ID');
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

function KpiGrid({ overview }: { overview: Overview }) {
  const { revenue, paidBookings, checkedInVisitors, rating } = overview;
  return (
    <section
      aria-label={text.kpiLabel}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiCard
        label={text.superadmin.revenue}
        icon={Banknote}
        value={<RupiahFigure amount={revenue.value} />}
        hint={text.superadmin.revenueHint}
        trend={revenue.trend}
        chart={sparklineOf(revenue.series)}
      />
      <KpiCard
        label={text.superadmin.paidBookings}
        icon={BadgeCheck}
        value={<CountUp value={paidBookings.value} onMount />}
        hint={text.superadmin.paidBookingsHint}
        trend={paidBookings.trend}
      />
      <KpiCard
        label={text.superadmin.checkedIn}
        icon={Users}
        value={<CountUp value={checkedInVisitors.value} onMount />}
        hint={text.superadmin.checkedInHint}
        trend={checkedInVisitors.trend}
        chart={sparklineOf(checkedInVisitors.series)}
      />
      <KpiCard
        label={text.superadmin.rating}
        icon={Star}
        value={rating.average === null ? EMPTY_FIGURE : formatRating(rating.average)}
        hint={text.superadmin.ratingHint(rating.count)}
      />
    </section>
  );
}

function Charts({ overview }: { overview: Overview }) {
  const revenue = overview.revenue.series;
  const checkIns = overview.checkedInVisitors.series;
  const revenueTotal = formatIDR(sumOf(revenue, (point) => point.value));
  const checkInTotal = numberFormat.format(sumOf(checkIns, (point) => point.value));
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        title={text.revenueChart.title}
        description={text.revenueChart.description}
        hasData={hasAnyValue(revenue)}
        empty={{ title: text.revenueChart.empty, description: text.revenueChart.emptyDescription }}
      >
        <LazyRevenueArea
          series={revenue}
          seriesName={text.revenueChart.series}
          summary={text.chartSummary(text.revenueChart.title, revenueTotal)}
        />
      </ChartCard>
      <ChartCard
        title={text.checkinsChart.title}
        description={text.checkinsChart.description}
        hasData={hasAnyValue(checkIns)}
        empty={{
          title: text.checkinsChart.empty,
          description: text.checkinsChart.emptyDescription,
        }}
      >
        <LazyCheckinsBar
          series={checkIns}
          seriesName={text.checkinsChart.series}
          summary={text.chartSummary(text.checkinsChart.title, checkInTotal)}
        />
      </ChartCard>
    </div>
  );
}

// Task P4.2.03: the superadmin's overview, for every RW or the one of their RwSwitcher.
export function SuperadminOverview({ overview }: { overview: Overview }) {
  return (
    <div className="flex flex-col gap-6">
      <KpiGrid overview={overview} />
      <Charts overview={overview} />
      <SecurityStrip
        alerts={overview.openAlerts}
        openCount={overview.openAlertCount}
        piiRevealsToday={overview.piiRevealsToday}
      />
    </div>
  );
}
