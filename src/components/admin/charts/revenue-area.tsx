'use client';

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import {
  AreaGradient,
  CHART_COLORS,
  CHART_GRID_COLOR,
  ChartContainer,
  ChartTooltip,
  DAY_AXIS,
  VALUE_AXIS,
} from '@/components/admin/charts/chart-container';
import { useSvgId } from '@/hooks/use-svg-id';
import { formatIDR, formatIDRCompact } from '@/lib/utils/currency';
import type { DailyValue } from '@/lib/utils/kpi';

const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const Y_AXIS_WIDTH = 72;
const STROKE_WIDTH = 2;

export interface RevenueAreaProps {
  series: DailyValue[];
  seriesName: string;
  summary: string;
}

// Task P4.2.02: the net ledger amount per Semarang day over the last 30 days. Never animated (§7.3).
export function RevenueArea({ series, seriesName, summary }: RevenueAreaProps) {
  const gradientId = useSvgId('revenue');
  return (
    <ChartContainer summary={summary} className="h-64">
      <AreaChart data={series} margin={MARGIN} accessibilityLayer={false}>
        <defs>
          <AreaGradient id={gradientId} />
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis {...DAY_AXIS} />
        <YAxis {...VALUE_AXIS} tickFormatter={formatIDRCompact} width={Y_AXIS_WIDTH} />
        <Tooltip
          isAnimationActive={false}
          cursor={{ stroke: CHART_GRID_COLOR }}
          content={(props) => (
            <ChartTooltip {...props} seriesName={seriesName} formatValue={formatIDR} />
          )}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS.primary}
          strokeWidth={STROKE_WIDTH}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
