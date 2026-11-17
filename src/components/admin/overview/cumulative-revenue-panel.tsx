import { ChartNoAxesColumn } from 'lucide-react';

import { LazyRevenueArea } from '@/components/admin/charts/lazy-charts';
import { OverviewPanel } from '@/components/admin/overview/overview-panel';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { cumulativeOf, hasAnyValue, type DailyValue } from '@/lib/utils/kpi';

const text = copy.dashboard.overview;

// "Pendapatan kumulatif" (Dasbor Gelap): the ledger's net amount over the last 30 days as a running total, so the line
// climbs as the month fills. The figure on top is where it stands today.
export function CumulativeRevenuePanel({ series }: { series: DailyValue[] | null }) {
  const running = series === null ? null : cumulativeOf(series);
  const total = running?.at(-1)?.value ?? 0;
  return (
    <OverviewPanel title={text.cumulative.title} description={text.cumulative.hint}>
      {running === null ? (
        <EmptyState icon={ChartNoAxesColumn} {...text.chartUnavailable} />
      ) : !hasAnyValue(running) ? (
        <EmptyState
          icon={ChartNoAxesColumn}
          title={text.revenueChart.empty}
          description={text.revenueChart.emptyDescription}
        />
      ) : (
        <div className="flex flex-col gap-3 px-4 py-4 md:px-5">
          <p className="text-h3 font-bold text-foreground tabular-nums">{formatIDR(total)}</p>
          <LazyRevenueArea
            series={running}
            seriesName={text.cumulative.series}
            summary={text.chartSummary(text.cumulative.title, formatIDR(total))}
          />
        </div>
      )}
    </OverviewPanel>
  );
}
