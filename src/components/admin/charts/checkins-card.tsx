import { ChartCard } from '@/components/admin/charts/chart-card';
import { LazyCheckinsBar } from '@/components/admin/charts/lazy-charts';
import { copy } from '@/lib/copy/id';
import { hasAnyValue, sumOf, type DailyValue } from '@/lib/utils/kpi';

const text = copy.dashboard.overview;
const numberFormat = new Intl.NumberFormat('id-ID');

// The 30-day check-in chart of both overviews. null: the rows could not be read whole, so nothing is drawn.
export function CheckInsCard({ series }: { series: DailyValue[] | null }) {
  const chart = text.checkinsChart;
  const total = series ? numberFormat.format(sumOf(series, (point) => point.value)) : '';
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
        <LazyCheckinsBar
          series={series}
          seriesName={chart.series}
          summary={text.chartSummary(chart.title, total)}
        />
      ) : null}
    </ChartCard>
  );
}
