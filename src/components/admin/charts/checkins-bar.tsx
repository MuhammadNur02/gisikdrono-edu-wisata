'use client';

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import {
  CHART_COLORS,
  CHART_GRID_COLOR,
  ChartContainer,
  ChartTooltip,
  DAY_AXIS,
  VALUE_AXIS,
} from '@/components/admin/charts/chart-container';
import type { DailyValue } from '@/lib/utils/kpi';

const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const Y_AXIS_WIDTH = 40;
const BAR_CORNER = 4;
const BAR_RADIUS: [number, number, number, number] = [BAR_CORNER, BAR_CORNER, 0, 0];
const peopleFormat = new Intl.NumberFormat('id-ID');

function formatPeople(value: number): string {
  return peopleFormat.format(value);
}

export interface CheckinsBarProps {
  series: DailyValue[];
  seriesName: string;
  summary: string;
}

// Task P4.2.02: the people checked in per Semarang day over the last 30 days. Never animated (§7.3).
export function CheckinsBar({ series, seriesName, summary }: CheckinsBarProps) {
  return (
    <ChartContainer summary={summary} className="h-64">
      <BarChart data={series} margin={MARGIN} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke={CHART_GRID_COLOR} />
        <XAxis {...DAY_AXIS} />
        <YAxis
          {...VALUE_AXIS}
          allowDecimals={false}
          tickFormatter={formatPeople}
          width={Y_AXIS_WIDTH}
        />
        <Tooltip
          isAnimationActive={false}
          cursor={{ fill: CHART_GRID_COLOR }}
          content={(props) => (
            <ChartTooltip {...props} seriesName={seriesName} formatValue={formatPeople} />
          )}
        />
        <Bar
          dataKey="value"
          fill={CHART_COLORS.secondary}
          radius={BAR_RADIUS}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
