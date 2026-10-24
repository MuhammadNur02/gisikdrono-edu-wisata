'use client';

import type { ReactElement } from 'react';
import { ResponsiveContainer, type TooltipContentProps } from 'recharts';

import { cn } from '@/lib/utils/cn';
import { formatDateShort, formatDayMonthShort } from '@/lib/utils/dates';

// docs/StyleGuide.md §2.1 and §6.3: admin charts draw with the chart tokens only, so light and dark mode follow
// globals.css. Recharts reads them as CSS variables at paint time. A daily series uses --chart-1 or --chart-2, the
// tones that keep 3:1 against the card in both themes (WCAG 1.4.11); --chart-3..5 wait for a split by series.
export const CHART_COLORS = {
  primary: 'var(--color-chart-1)',
  secondary: 'var(--color-chart-2)',
} as const;

const AXIS_FONT_SIZE = 12;
const DAY_TICK_GAP = 24;
const AXIS_TICK = { fill: 'var(--color-muted-foreground)', fontSize: AXIS_FONT_SIZE };

export const CHART_GRID_COLOR = 'var(--color-border)';

// The props every daily chart gives its axes: the day along the bottom, the values up the side.
export const DAY_AXIS = {
  dataKey: 'day',
  tickFormatter: formatDayMonthShort,
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  minTickGap: DAY_TICK_GAP,
} as const;
export const VALUE_AXIS = { tick: AXIS_TICK, tickLine: false, axisLine: false } as const;

const FILL_TOP_OPACITY = 0.25;

// docs/StyleGuide.md §6.3: the area fill, --chart-1 from 25 % down to nothing. Rendered inside a chart's <defs>.
export function AreaGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={FILL_TOP_OPACITY} />
      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
    </linearGradient>
  );
}

export interface ChartContainerProps {
  // The drawn chart is hidden from assistive technology; this sentence is what a screen reader hears instead.
  summary: string;
  className?: string;
  children: ReactElement;
}

export interface ChartTooltipProps extends TooltipContentProps<number, string> {
  seriesName: string;
  formatValue: (value: number) => string;
}

// The hover card of a daily series: the day, then the series' value as the page formats it.
export function ChartTooltip({
  active,
  payload,
  label,
  seriesName,
  formatValue,
}: ChartTooltipProps) {
  const point = payload[0];
  if (!active || !point || typeof label !== 'string') return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-caption text-popover-foreground shadow-md">
      <p className="font-medium">{formatDateShort(label)}</p>
      <p className="tabular-nums">{`${seriesName}: ${formatValue(point.value ?? 0)}`}</p>
    </div>
  );
}

// The frame of every admin chart (Task P4.2.02): a figure that sizes the chart to its box and carries a text
// version of it. The charts set accessibilityLayer={false}, since nothing inside an aria-hidden box may take focus.
export function ChartContainer({ summary, className, children }: ChartContainerProps) {
  return (
    <figure className={cn('w-full', className)}>
      <div aria-hidden className="size-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
